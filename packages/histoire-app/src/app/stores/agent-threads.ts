import type { UiAgentActivity, UiAgentReply, UiAgentStep, UiAgentThreadBase } from '@histoire/shared'
import { computed, ref, shallowRef } from 'vue'

/** Bounded snapshot part shared by every persisted conversation feature. */
export interface ThreadsSnapshotPart<T> {
  /** Whether this dev generation enables the feature. */
  enabled: boolean
  /** Snapshot publication identity. */
  revision: string
  /** Zero-based part number. */
  part: number
  /** Total parts in this publication. */
  total: number
  /** Records within this part. */
  items: T[]
  /** Deliberate recoverable server/storage failure. */
  error?: string
  /** Request owning this private failure publication. */
  requestId?: string
}

/**
 * Small injectable transport lets tests prove snapshot and request ownership.
 * `S` lets a feature carry extra snapshot fields (e.g. pin availability).
 */
export interface ThreadsTransport<T, S extends ThreadsSnapshotPart<T> = ThreadsSnapshotPart<T>> {
  /** Whether development transport is available. */
  available: boolean
  /** Submit one bounded feature message. */
  send: (event: `histoire:ui:${string}`, value: unknown) => boolean
  /** Observe complete snapshots, normalized to `items`. */
  subscribe: (callback: (snapshot: S) => void) => () => void
  /** Optional streamed deltas; persisted snapshots remain final authority. */
  stream?: (callback: (reply: UiAgentReply) => void) => () => void
  /** Optional streamed tool call/thinking step upserts. */
  activity?: (callback: (activity: UiAgentActivity) => void) => () => void
  /** Retire editing authority after disconnect. */
  disconnect: (callback: () => void) => () => void
}

/** Live agent output for a working thread, replaced by the persisted reply. */
export interface ThreadStreaming {
  /** Agent producing the output. */
  agentId: string
  /** Partial reply text. */
  text: string
  /** Steps in arrival order, upserted by id. */
  steps: UiAgentStep[]
  /** Client time the first live output arrived, for elapsed display. */
  startedAt: number
}

/** Statuses during which an agent owns the thread. */
export function isThreadBusy(thread: Pick<UiAgentThreadBase, 'status'>): boolean {
  return thread.status === 'sent' || thread.status === 'working'
}

/**
 * Persisted conversations plus live agent output, independent of feature-specific drafts.
 * @param transport Development channel adapter.
 * @param labels User-facing failure notices.
 * @param labels.unavailable Shown when the channel refuses a message.
 * @param labels.tooLarge Shown when a message exceeds the envelope.
 * @param onSnapshot Called after each complete snapshot install.
 */
export function createThreadsModel<T extends UiAgentThreadBase, S extends ThreadsSnapshotPart<T> = ThreadsSnapshotPart<T>>(transport: ThreadsTransport<T, S>, labels: { unavailable: string, tooLarge: string }, onSnapshot?: (snapshot: S) => void) {
  const items = shallowRef<T[]>([])
  const streaming = shallowRef<Record<string, ThreadStreaming>>({})
  const enabled = ref(false)
  const connected = ref(transport.available)
  let active = true
  let errorTimeout: ReturnType<typeof setTimeout> | undefined
  const errorMessage = ref('')
  const error = computed({
    /** Current transient failure. */
    get: () => errorMessage.value,
    /** Every failure gets five seconds, including repeated identical messages. */
    set(message: string) {
      if (!active) return
      clearTimeout(errorTimeout)
      errorMessage.value = message
      if (message) errorTimeout = setTimeout(() => errorMessage.value = '', 5000)
    },
  })
  let publication: { revision: string, total: number, parts: Map<number, T[]> } | undefined
  /** Install complete snapshots atomically; interleaved older publications are retired. */
  function receive(snapshot: S) {
    if (!active || snapshot.total < 1 || snapshot.part < 0 || snapshot.part >= snapshot.total) return
    if (snapshot.part === 0) publication = { revision: snapshot.revision, total: snapshot.total, parts: new Map() }
    if (!publication || publication.revision !== snapshot.revision || publication.total !== snapshot.total) return
    publication.parts.set(snapshot.part, snapshot.items)
    if (publication.parts.size !== publication.total) return
    items.value = Array.from({ length: publication.total }, (_, index) => publication!.parts.get(index) ?? []).flat()
    // Final disk snapshots replace transient chunks of threads no longer owned by their agent.
    streaming.value = Object.fromEntries(Object.entries(streaming.value).filter(([id, reply]) => items.value.some(item => item.id === id && item.agentId === reply.agentId && isThreadBusy(item))))
    enabled.value = snapshot.enabled
    connected.value = true
    error.value = snapshot.error ?? ''
    publication = undefined
    onSnapshot?.(snapshot)
  }
  /** Live entry of a known working thread, from its persisted destination. */
  function live(threadId: string, agentId: string): ThreadStreaming | undefined {
    if (!active || !connected.value) return undefined
    const item = items.value.find(item => item.id === threadId && item.agentId === agentId && isThreadBusy(item))
    if (!item) return undefined
    return streaming.value[item.id] ?? { agentId, text: '', steps: [], startedAt: Date.now() }
  }
  /** Stream only a known working thread. */
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
  const offs = transport.available
    ? [
        transport.subscribe(receive),
        transport.stream?.(receiveReply) ?? (() => {}),
        transport.activity?.(receiveActivity) ?? (() => {}),
        transport.disconnect(() => {
          connected.value = false
          publication = undefined
          streaming.value = {}
        }),
      ]
    : []
  if (transport.available) transport.send('histoire:ui:ready', {})
  const available = computed(() => enabled.value && connected.value && active)
  return { items, streaming, enabled, connected, available, error,
    /** Requests never optimistically claim agent delivery or disk persistence. */
    send(event: `histoire:ui:${string}`, value: unknown): boolean {
      if (!available.value) return false
      try {
        if (transport.send(event, value)) return true
        error.value = labels.unavailable
      }
      catch { error.value = labels.tooLarge }
      return false
    },
    /** Teardown observes no further publications. */
    close() {
      active = false
      clearTimeout(errorTimeout)
      errorMessage.value = ''
      connected.value = false
      offs.forEach(off => off())
      publication = undefined
      streaming.value = {}
    } }
}
