import type { HistoireTarget } from '@histoire/protocol'
import type { UiAgentActivity, UiAgentReply, UiAgentStep, UiComment, UiCommentDraft, UiCommentsSnapshot } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { computed, inject, provide, ref, shallowRef } from 'vue'
import { isUiChannelAvailable, onUiDisconnect, onUiEvent, sendUiEvent } from '../util/ui-channel.js'

/** Small injectable transport lets tests prove snapshot and request ownership. */
export interface CommentsTransport {
  /** Whether development transport is available. */
  available: boolean
  /** Submit one bounded feature message. */
  send: (event: `histoire:ui:${string}`, value: unknown) => boolean
  /** Observe complete comment snapshots. */
  subscribe: (callback: (snapshot: UiCommentsSnapshot) => void) => () => void
  /** Optional streamed deltas; persisted snapshots remain final authority. */
  stream?: (callback: (reply: UiAgentReply) => void) => () => void
  /** Optional streamed tool call/thinking step upserts. */
  activity?: (callback: (activity: UiAgentActivity) => void) => () => void
  /** Retire editing authority after disconnect. */
  disconnect: (callback: () => void) => () => void
}

/** Draft context captured from an exact ready frame; no runtime state owner is retained. */
export interface CommentComposeContext {
  /** Exact variant owning this annotation. */
  target: HistoireTarget
  /** Logical click position plus optional picked selector. */
  anchor: UiComment['anchor']
  /** JSON-safe prop snapshot. */
  props?: Record<string, unknown>
  /** Existing generated screenshot path. */
  screenshot?: string
}

/** Live agent output for a working thread, replaced by the persisted reply. */
export interface CommentStreaming {
  /** Agent producing the output. */
  agentId: string
  /** Partial reply text. */
  text: string
  /** Steps in arrival order, upserted by id. */
  steps: UiAgentStep[]
  /** Client time the first live output arrived, for elapsed display. */
  startedAt: number
}

/** Extract client-writable fields from a persisted comment for exact save acknowledgment. */
function persistedDraft(comment: UiComment): UiCommentDraft {
  return { id: comment.id, storyId: comment.storyId, variantId: comment.variantId, anchor: comment.anchor, body: comment.body, props: comment.props, screenshot: comment.screenshot }
}

/** Server normalization must match every submitted writable value before dismissing its composer. */
function sameCommentDraft(comment: UiComment, draft: UiCommentDraft): boolean {
  /** Use one fixed key order because object insertion order is not persistence authority. */
  function fields(value: UiCommentDraft) {
    return { id: value.id, storyId: value.storyId, variantId: value.variantId, anchor: value.anchor, props: value.props, screenshot: value.screenshot, body: value.body }
  }
  return JSON.stringify(fields(persistedDraft(comment))) === JSON.stringify(fields(draft))
}

/** Independent workbench model; static callers install no filesystem or HMR authority. */
export function createWorkbenchComments(transport: CommentsTransport = {
  available: isUiChannelAvailable(),
  send: sendUiEvent,
  subscribe: callback => onUiEvent('histoire:ui:comments-snapshot', callback),
  stream: callback => onUiEvent('histoire:ui:agent-reply', callback),
  activity: callback => onUiEvent('histoire:ui:agent-activity', callback),
  disconnect: onUiDisconnect,
}) {
  const comments = shallowRef<UiComment[]>([])
  const streaming = shallowRef<Record<string, CommentStreaming>>({})
  const enabled = ref(false)
  const connected = ref(transport.available)
  let active = true
  let errorTimeout: ReturnType<typeof setTimeout> | undefined
  const errorMessage = ref('')
  const error = computed({
    /** Canvas and pane share the same transient error. */
    get: () => errorMessage.value,
    /** Every failure gets five seconds, including repeated identical messages. */
    set(message: string) {
      if (!active) return
      clearTimeout(errorTimeout)
      errorMessage.value = message
      if (message) errorTimeout = setTimeout(() => errorMessage.value = '', 5000)
    },
  })
  const activeId = ref<string | null>(null)
  const draft = shallowRef<UiCommentDraft | null>(null)
  const pending = ref(false)
  const showResolved = ref(false)
  let pendingRequest: { id: string, draft: UiCommentDraft } | undefined
  let publication: { revision: string, total: number, parts: Map<number, UiComment[]> } | undefined
  /** Install complete snapshots atomically; interleaved older publications are retired. */
  function receive(snapshot: UiCommentsSnapshot) {
    if (!active || snapshot.total < 1 || snapshot.part < 0 || snapshot.part >= snapshot.total) return
    if (snapshot.part === 0) publication = { revision: snapshot.revision, total: snapshot.total, parts: new Map() }
    if (!publication || publication.revision !== snapshot.revision || publication.total !== snapshot.total) return
    publication.parts.set(snapshot.part, snapshot.comments)
    if (publication.parts.size !== publication.total) return
    comments.value = Array.from({ length: publication.total }, (_, index) => publication!.parts.get(index) ?? []).flat()
    // Final disk snapshots replace transient chunks. Unrelated comment updates
    // preserve only the exact conversation still owned by a working agent.
    streaming.value = Object.fromEntries(Object.entries(streaming.value).filter(([id, reply]) => comments.value.some(comment => comment.id === id && comment.agentId === reply.agentId && ['sent', 'working'].includes(comment.status))))
    enabled.value = snapshot.enabled
    connected.value = true
    error.value = snapshot.error ?? ''
    if (pendingRequest) {
      const saved = comments.value.find(comment => sameCommentDraft(comment, pendingRequest!.draft))
      if (saved) {
        activeId.value = saved.id
        draft.value = null
        pendingRequest = undefined
        pending.value = false
      }
      else if (snapshot.error && snapshot.requestId === pendingRequest.id) {
        draft.value = pendingRequest.draft
        pendingRequest = undefined
        pending.value = false
      }
    }
    publication = undefined
  }
  /** Live entry of a known working thread, from its persisted destination. */
  function live(threadId: string, agentId: string): CommentStreaming | undefined {
    if (!active || !connected.value) return undefined
    const comment = comments.value.find(comment => comment.id === threadId && comment.agentId === agentId && ['sent', 'working'].includes(comment.status))
    if (!comment) return undefined
    return streaming.value[comment.id] ?? { agentId, text: '', steps: [], startedAt: Date.now() }
  }
  /** Stream only a known working thread, from its persisted destination. */
  function receiveReply(reply: UiAgentReply) {
    if (typeof reply.text !== 'string') return
    const entry = live(reply.threadId, reply.agentId)
    if (entry) streaming.value = { ...streaming.value, [reply.threadId]: { ...entry, text: `${entry.text}${reply.text}`.slice(0, 8192) } }
  }
  /** Upsert one step of a known working thread. */
  function receiveActivity(activity: UiAgentActivity) {
    if (typeof activity.step?.id !== 'string') return
    const entry = live(activity.threadId, activity.agentId)
    if (!entry) return
    const index = entry.steps.findIndex(step => step.id === activity.step.id)
    const steps = index === -1 ? [...entry.steps, activity.step].slice(-200) : entry.steps.map((step, position) => position === index ? activity.step : step)
    streaming.value = { ...streaming.value, [activity.threadId]: { ...entry, steps } }
  }
  const off = transport.available ? transport.subscribe(receive) : () => {}
  const offStream = transport.available ? transport.stream?.(receiveReply) ?? (() => {}) : () => {}
  const offActivity = transport.available ? transport.activity?.(receiveActivity) ?? (() => {}) : () => {}
  const disconnect = transport.available
    ? transport.disconnect(() => {
        connected.value = false
        pending.value = false
        pendingRequest = undefined
        publication = undefined
        streaming.value = {}
      })
    : () => {}
  if (transport.available) transport.send('histoire:ui:ready', {})
  const available = computed(() => enabled.value && connected.value && active)
  /** Requests never optimistically claim agent delivery or disk persistence. */
  function send(event: `histoire:ui:${string}`, value: unknown): boolean {
    if (!available.value) return false
    try {
      if (transport.send(event, value)) return true
      error.value = 'Comments unavailable. Reconnect development server.'
    }
    catch { error.value = 'Comment exceeds message limit. Reduce attached context.' }
    return false
  }
  return { comments, streaming, enabled, connected, available, error, activeId, draft, pending, showResolved,
    /** Selected persisted thread for canvas and pane. */
    selected: computed(() => comments.value.find(comment => comment.id === activeId.value)),
    /** Number of non-resolved annotations for the rail badge. */
    count: computed(() => comments.value.filter(comment => comment.status !== 'resolved').length),
    /** Create local draft only after an exact variant point is selected. */
    compose(context: CommentComposeContext): boolean {
      if (!available.value || !context.target.variantId) return false
      activeId.value = null
      draft.value = { id: crypto.randomUUID(), storyId: context.target.storyId, variantId: context.target.variantId, anchor: context.anchor, props: context.props, screenshot: context.screenshot, body: '' }
      return true
    },
    /** Persist a composer draft independently of agent setup. */
    save(value: UiCommentDraft): boolean {
      if (pending.value) return false
      const requestId = crypto.randomUUID()
      const accepted = send('histoire:ui:comment-upsert', { ...value, requestId })
      if (accepted) {
        pendingRequest = { id: requestId, draft: value }
        draft.value = value
        pending.value = true
      }
      return accepted
    },
    /** Save and send arrive as one request, avoiding async upsert/send races. */
    sendDraft(value: UiCommentDraft, agentId: string): boolean {
      if (pending.value) return false
      const requestId = crypto.randomUUID()
      const accepted = send('histoire:ui:comment-send', { ids: [value.id], agentId, draft: value, requestId })
      if (accepted) {
        pendingRequest = { id: requestId, draft: value }
        draft.value = value
        pending.value = true
      }
      return accepted
    },
    /** Ordered server dispatcher preserves separate comment conversations. */
    send(ids: string[], agentId: string): boolean { return send('histoire:ui:comment-send', { ids, agentId }) },
    /** Resolve hides pin and closes its card while retaining full persisted conversation. */
    resolve(id: string, resolved: boolean): boolean {
      const accepted = send('histoire:ui:comment-resolve', { id, resolved })
      if (accepted && resolved && activeId.value === id) activeId.value = null
      return accepted
    },
    /** User reply is stored before continuing its configured conversation. */
    reply(id: string, body: string): boolean { return send('histoire:ui:comment-reply', { id, body }) },
    /** Delete only the requested thread. */
    remove(id: string): boolean { return send('histoire:ui:comment-delete', { id }) },
    /** Reveal an existing exact thread and dismiss local composer. */
    open(id: string): void {
      draft.value = null
      activeId.value = id
    },
    /** Pin click opens its thread, or minimizes it back to the pin when already open. */
    toggle(id: string): void {
      draft.value = null
      activeId.value = activeId.value === id ? null : id
    },
    /** Dismiss floating UI without changing persisted annotations or accepted work. */
    dismiss(): void {
      draft.value = null
      activeId.value = null
      pendingRequest = undefined
      pending.value = false
    },
    /** Resolved pins remain a local presentation preference. */
    toggleResolved(): void { showResolved.value = !showResolved.value },
    /** Component/provider teardown observes no further publications. */
    close() {
      active = false
      clearTimeout(errorTimeout)
      errorMessage.value = ''
      connected.value = false
      off()
      offStream()
      offActivity()
      disconnect()
      publication = undefined
      streaming.value = {}
    } }
}

/** One explicitly scoped shell instance feeds both canvas pins and rail pane. */
export type WorkbenchComments = ReturnType<typeof createWorkbenchComments>
/** Injection remains local to this app rather than leaking between embedded books. */
const key: InjectionKey<WorkbenchComments> = Symbol('Workbench comments')

/** Install shell-owned comments state. */
export function provideWorkbenchComments(model: WorkbenchComments): void {
  provide(key, model)
}
/** Optional models make shared static/read-only canvas components work independently. */
export function useWorkbenchComments(): WorkbenchComments | undefined {
  return inject(key, undefined)
}
