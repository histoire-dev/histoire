/**
 * Request/reply correlation for the dev-server "plugin event" channel exposed
 * as `window.__HST_PLUGIN_API__.sendEvent`.
 *
 * Extracted from the `import.meta.hot` wiring in `plugin.ts` so the correlation
 * rules — which reply settles which promise, and what happens when none ever
 * arrives — are plain logic over an injected transport.
 */

/** Payload of a `histoire:dev-event-result` message from the dev server. */
export interface DevEventResult {
  /** Name of the event this result answers. */
  event: string
  /** Id of the request it answers; absent for legacy plugin replies. */
  requestId?: string
  /** Value to resolve `sendEvent` with. */
  result?: any
  /** Message to reject `sendEvent` with. */
  error?: string
}

/** The dev-server channel `createDevEventApi` drives. */
export interface DevEventTransport {
  /** Sends a `histoire:dev-event` request to the dev server. */
  send: (payload: { event: string, payload?: any, requestId: string }) => void
  /** Subscribes to every `histoire:dev-event-result` message. */
  onResult: (listener: (result: DevEventResult) => void) => void
}

/**
 * Backstop before a lost result message rejects the promise.
 *
 * The node run has a 300s safety cap, so this must stay comfortably longer than
 * any legitimate run or it would kill a real one.
 */
export const DEV_EVENT_TIMEOUT = 360_000

/**
 * Builds a per-browser-client id used to prefix request ids.
 *
 * A plain counter restarts at 1 in every tab, so two tabs would generate the
 * same ids and a plugin broadcasting its reply could settle the wrong tab's
 * request. `crypto.randomUUID` needs a secure context (absent on plain-http LAN
 * dev), hence the random+time fallback.
 */
function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Creates the `sendEvent` half of the dev plugin API.
 *
 * @param transport Dev-server channel to send requests on and receive results from.
 */
export function createDevEventApi(transport: DevEventTransport) {
  const listeners: Record<string, Set<(result: DevEventResult) => void>> = {}
  const clientId = createClientId()
  let requestCounter = 0

  transport.onResult((result) => {
    // Forward the whole result (including `error`) so `sendEvent` can reject on
    // failure instead of waiting forever for a value that never arrives.
    for (const listener of listeners[result.event] ?? []) {
      listener(result)
    }
  })

  /**
   * Registers a result listener for one event.
   * @returns A disposer detaching it again.
   */
  function addListener(event: string, listener: (result: DevEventResult) => void) {
    const set = listeners[event] ??= new Set()
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /**
   * Sends an event to the dev server and awaits its result.
   *
   * Events named `on*` are fire-and-forget hooks: the dev server never replies,
   * so the promise resolves immediately instead of waiting out the backstop.
   *
   * @param event Event name handled by a Histoire plugin on the node side.
   * @param payload Arbitrary JSON payload for that plugin.
   */
  function sendEvent(event: string, payload?: any) {
    return new Promise<any>((resolve, reject) => {
      const requestId = `${clientId}-${++requestCounter}`
      transport.send({ event, payload, requestId })

      if (event.startsWith('on')) {
        resolve(undefined)
        return
      }

      // Held so both the result handler and the timeout can detach the listener
      // before settling.
      let off: () => void = () => {}

      const timeout = setTimeout(() => {
        off()
        reject(new Error(`Histoire dev event "${event}" timed out after ${DEV_EVENT_TIMEOUT / 1000}s without a result.`))
      }, DEV_EVENT_TIMEOUT)

      off = addListener(event, ({ requestId: resultRequestId, result, error }) => {
        // Results reach every client and every pending call of this event — only
        // settle with our own. Replies without a request id come from legacy
        // plugin handlers and still settle anyone waiting.
        if (resultRequestId !== undefined && String(resultRequestId) !== requestId) {
          return
        }

        off()
        clearTimeout(timeout)
        if (error) {
          reject(new Error(error))
        }
        else {
          resolve(result)
        }
      })
    })
  }

  return { sendEvent }
}
