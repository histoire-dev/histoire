import type { HistoireTarget } from '@histoire/protocol'
import type { UiAiThread, UiAiThreadAnchor, UiAiThreadDraft, UiCommentSessionOptions } from '@histoire/shared'
import type { Ref, ShallowRef } from 'vue'
import type { ThreadsSnapshotPart } from './agent-threads.js'
import { ref, shallowRef } from 'vue'

/** Draft context captured from an exact ready frame; no runtime state owner is retained. */
export interface PinComposeContext {
  /** Exact variant owning this pinned thread. */
  target: HistoireTarget
  /** Logical click position plus optional picked selector. */
  anchor: UiAiThreadAnchor
  /** JSON-safe prop snapshot. */
  props?: Record<string, unknown>
  /** Existing generated screenshot path. */
  screenshot?: string
}

/** Store state the draft requests read and update. */
export interface ThreadDraftsOptions {
  /** Channel send, refusing while unavailable. */
  send: (event: `histoire:ui:${string}`, value: unknown) => boolean
  /** Persisted threads. */
  items: ShallowRef<UiAiThread[]>
  /** Open thread. */
  activeId: Ref<string | null>
  /** Pane new-thread view is open. */
  composing: Ref<boolean>
  /** Canvas pins can be created. */
  pinsAvailable: Readonly<Ref<boolean>>
}

/** Request awaiting its snapshot: either the pane composer or the canvas draft. */
interface PendingRequest {
  /** Correlates a private failure snapshot. */
  requestId: string
  /** Submitted draft; its id appears in the snapshot once stored. */
  draft: UiAiThreadDraft
  /** Canvas drafts restore into the floating composer on failure. */
  canvas: boolean
}

/**
 * New-thread requests (pane create, canvas save/send) and the canvas draft.
 * One request is pending at a time; it is released when the snapshot contains
 * the draft id, or by a failure snapshot carrying its `requestId`.
 * @param options Store state shared with the threads model.
 */
export function createThreadDrafts(options: ThreadDraftsOptions) {
  const { send, items, activeId, composing, pinsAvailable } = options
  /** Unsaved pinned draft shown in the canvas composer. */
  const draft = shallowRef<UiAiThreadDraft | null>(null)
  const pending = ref(false)
  let request: PendingRequest | undefined

  /** Forget the pending request. */
  function release(): void {
    request = undefined
    pending.value = false
  }

  /** Send one owned request; `canvas` drafts stay in the floating composer until stored. */
  function submit(event: `histoire:ui:${string}`, value: UiAiThreadDraft, extra: Record<string, unknown>, canvas: boolean): boolean {
    if (pending.value) return false
    const requestId = crypto.randomUUID()
    const accepted = send(event, { draft: value, ...extra, requestId })
    if (accepted) {
      request = { requestId, draft: value, canvas }
      pending.value = true
      if (canvas) draft.value = value
    }
    return accepted
  }

  /** Session choices are sent only when some were made. */
  function withOptions(agentId: string, sessionOptions?: UiCommentSessionOptions) {
    return { agentId, ...(sessionOptions && Object.keys(sessionOptions).length ? { options: sessionOptions } : {}) }
  }

  return { draft, pending, release,
    /** Release the pending request once its thread is stored or its failure arrives. */
    receive(snapshot: ThreadsSnapshotPart<UiAiThread>): void {
      const owner = request
      if (!owner) return
      if (items.value.some(thread => thread.id === owner.draft.id)) {
        activeId.value = owner.draft.id
        if (owner.canvas) draft.value = null
        else composing.value = false
        release()
      }
      else if (snapshot.error && snapshot.requestId === owner.requestId) {
        // The composer keeps the submitted text so the user can retry.
        if (owner.canvas) draft.value = owner.draft
        release()
      }
    },
    /** Create a pane thread and send it in one request. */
    create(value: UiAiThreadDraft, agentId: string, sessionOptions?: UiCommentSessionOptions): boolean {
      return submit('histoire:ui:ai-thread-create', value, withOptions(agentId, sessionOptions), false)
    },
    /** Start a canvas draft only after an exact variant point is selected. */
    composePin(context: PinComposeContext): boolean {
      if (!pinsAvailable.value || !context.target.variantId) return false
      activeId.value = null
      draft.value = {
        id: crypto.randomUUID(),
        body: '',
        context: { storyId: context.target.storyId, variantId: context.target.variantId },
        anchor: context.anchor,
        ...(context.props ? { props: context.props } : {}),
        ...(context.screenshot ? { screenshot: context.screenshot } : {}),
      }
      return true
    },
    /** Store the canvas draft without sending it. */
    save(value: UiAiThreadDraft): boolean {
      return submit('histoire:ui:ai-thread-save', value, {}, true)
    },
    /** Save and send arrive as one request, avoiding async save/send races. */
    sendDraft(value: UiAiThreadDraft, agentId: string, sessionOptions?: UiCommentSessionOptions): boolean {
      return submit('histoire:ui:ai-thread-create', value, withOptions(agentId, sessionOptions), true)
    },
    /** Drop the canvas draft and its pending request; accepted work is unaffected. */
    dismissDraft(): void {
      draft.value = null
      if (request?.canvas) release()
    } }
}
