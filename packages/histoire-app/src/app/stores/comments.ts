import type { HistoireTarget } from '@histoire/protocol'
import type { UiAgentReply, UiComment, UiCommentDraft, UiCommentsSnapshot } from '@histoire/shared'
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
  disconnect: onUiDisconnect,
}) {
  const comments = shallowRef<UiComment[]>([])
  const streaming = shallowRef<Record<string, { agentId: string, text: string }>>({})
  const enabled = ref(false)
  const connected = ref(transport.available)
  const error = ref('')
  const activeId = ref<string | null>(null)
  const draft = shallowRef<UiCommentDraft | null>(null)
  const pending = ref(false)
  const showResolved = ref(false)
  let active = true
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
  /** Stream only a known working thread, from its persisted destination. */
  function receiveReply(reply: UiAgentReply) {
    if (!active || !connected.value || typeof reply.text !== 'string') return
    const comment = comments.value.find(comment => comment.id === reply.threadId && comment.agentId === reply.agentId && ['sent', 'working'].includes(comment.status))
    if (!comment) return
    streaming.value = { ...streaming.value, [comment.id]: { agentId: reply.agentId, text: `${streaming.value[comment.id]?.text ?? ''}${reply.text}`.slice(0, 8192) } }
  }
  const off = transport.available ? transport.subscribe(receive) : () => {}
  const offStream = transport.available ? transport.stream?.(receiveReply) ?? (() => {}) : () => {}
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
    /** Resolve hides pin while retaining full persisted conversation. */
    resolve(id: string, resolved: boolean): boolean { return send('histoire:ui:comment-resolve', { id, resolved }) },
    /** User reply is stored before continuing its configured conversation. */
    reply(id: string, body: string): boolean { return send('histoire:ui:comment-reply', { id, body }) },
    /** Delete only the requested thread. */
    remove(id: string): boolean { return send('histoire:ui:comment-delete', { id }) },
    /** Reveal an existing exact thread and dismiss local composer. */
    open(id: string): void {
      draft.value = null
      activeId.value = id
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
      connected.value = false
      off()
      offStream()
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
