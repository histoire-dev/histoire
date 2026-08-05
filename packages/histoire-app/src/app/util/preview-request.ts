/**
 * Request/reply plumbing for the host <-> preview iframe postMessage channel.
 *
 * Both kinds of request (test collection and test run) share the same shape:
 * one in-flight request at a time, correlated by id AND by the variant it asked
 * about, bounded by a reply timeout.
 */

/**
 * Default time budget for the preview iframe to answer a request.
 *
 * Sized for a request the iframe answers with work it controls (collecting the
 * tests of one variant). Running the tests is user code of unbounded duration
 * and passes its own budget — see `FrameRequestOptions.timeoutMs`.
 */
export const REQUEST_TIMEOUT = 15000

/**
 * Extra attempts made when the iframe answers about a different variant than
 * the one that was requested. See `VariantMismatchError`.
 */
export const VARIANT_MISMATCH_RETRIES = 2

/** A collect/run request waiting for its matching reply from the iframe. */
export interface PendingRequest<T> {
  /** Request id the iframe echoes back (`requestId` / `runId`). */
  id: string
  resolve: (value: T) => void
  reject: (error: Error) => void
  /** `storyId:variantId` this request asked about, when scoped to a variant. */
  variantKey?: string | null
  /** Settles (never rejects) when this request resolves, rejects or times out. */
  settled: Promise<void>
}

/** Everything needed to drive one kind of request (collection or run). */
export interface FrameRequestOptions<T> {
  /** Reads the slot holding the in-flight request of this kind. */
  getPending: () => PendingRequest<T> | null
  /** Writes (or clears) the slot for this kind. */
  setPending: (request: PendingRequest<T> | null) => void
  /** Returns the iframe currently hosting the preview, if any. */
  getFrame: () => HTMLIFrameElement | null | undefined
  /** Allocates the next request id for this kind. */
  nextId: () => string
  /** Error message used when the iframe never answers. */
  timeoutMessage: string
  /** Time budget for the reply, defaults to {@link REQUEST_TIMEOUT}. */
  timeoutMs?: number
  /** Variant this request is scoped to, when any. */
  variantKey?: string | null
  /** Posts the request payload into the iframe. */
  post: (frame: HTMLIFrameElement, requestId: string) => void
}

/**
 * Raised when the iframe replies about a variant other than the requested one.
 *
 * The iframe tags its success replies with the story/variant it captured
 * synchronously *before* awaiting, so a mismatch proves it collected/ran a
 * different variant (it reads its own selection at message-receipt time) and
 * that this reply can never satisfy the request.
 */
export class VariantMismatchError extends Error {
  constructor(requestedVariantKey: string | null | undefined, repliedVariantKey: unknown) {
    super(`Preview iframe answered about variant "${String(repliedVariantKey)}" instead of the requested "${String(requestedVariantKey)}".`)
    this.name = 'VariantMismatchError'
  }
}

/**
 * Settles a pending request with an inbound reply from the preview iframe.
 *
 * A reply carrying another id is ignored (it answers an already settled
 * request). A reply for another variant rejects the request immediately rather
 * than being dropped: leaving the slot pending would stall it for the full
 * `REQUEST_TIMEOUT` and queue every later collect/run behind it.
 *
 * @param request - The currently pending request, if any.
 * @param clearSlot - Frees the store slot holding `request`.
 * @param replyId - Request id echoed by the iframe.
 * @param replyVariantKey - Variant key the iframe actually answered about.
 * @param getValue - Builds the resolved value from the reply payload.
 */
export function settleReply<T>(
  request: PendingRequest<T> | null,
  clearSlot: () => void,
  replyId: unknown,
  replyVariantKey: unknown,
  getValue: () => T,
) {
  if (!request || String(replyId) !== request.id) {
    return
  }

  // Free the slot first so the rejection handler does not see itself as the
  // active in-flight request.
  clearSlot()

  // A nullish key means "whatever the iframe currently has selected", so any
  // variant it answers about is the right one.
  if (request.variantKey != null && String(replyVariantKey) !== String(request.variantKey)) {
    request.reject(new VariantMismatchError(request.variantKey, replyVariantKey))
    return
  }

  request.resolve(getValue())
}

/**
 * Posts a single attempt into `frame` and waits for the iframe to answer it.
 *
 * The returned promise settles on reply, timeout or abort, and always frees
 * both the timer and the queue slot (`settled`) on the way out.
 */
function postFrameRequest<T>(frame: HTMLIFrameElement, options: FrameRequestOptions<T>) {
  const requestId = options.nextId()
  let settle!: () => void
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const active = options.getPending()
      if (!active || active.id !== requestId) {
        return
      }

      options.setPending(null)
      active.reject(new Error(options.timeoutMessage))
    }, options.timeoutMs ?? REQUEST_TIMEOUT)

    const finish = () => {
      window.clearTimeout(timeout)
      settle()
    }

    options.setPending({
      id: requestId,
      resolve: (value) => {
        finish()
        resolve(value)
      },
      reject: (error) => {
        finish()
        reject(error)
      },
      variantKey: options.variantKey,
      settled,
    })

    options.post(frame, requestId)
  })
}

/**
 * Sends a request to the current preview iframe, queueing behind any request of
 * the same kind and retrying a variant mismatch.
 *
 * @param options - Slot accessors and payload builder for this request kind.
 * @returns The value carried by the iframe's matching reply.
 */
export async function requestFromFrame<T>(options: FrameRequestOptions<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // Wait for an active request instead of throwing: a dropped request left
    // the panel on stale definitions with nothing to trigger a recollect (the
    // readiness watcher only fires on state transitions), and a dropped run
    // escalated to the heavy node-side fallback. Every pending request settles
    // via reply, timeout or abort, so this cannot wait forever.
    let active = options.getPending()
    while (active) {
      await active.settled
      active = options.getPending()
    }

    const frame = options.getFrame()
    if (!frame?.contentWindow) {
      throw new Error('Preview iframe is not ready yet.')
    }

    try {
      return await postFrameRequest(frame, options)
    }
    catch (error) {
      // A variant mismatch is a transient race: the iframe had not applied the
      // host's newest selection yet when it received the request. Re-issue it
      // here instead of rejecting outward — the tests store answers a failed
      // run by escalating to the node-side vitest browser fallback (a full
      // headless Chromium run), far more expensive than another round trip.
      // The retries are bounded so a persistently disagreeing iframe still
      // surfaces the error instead of looping.
      if (error instanceof VariantMismatchError && attempt < VARIANT_MISMATCH_RETRIES) {
        continue
      }
      throw error
    }
  }
}
