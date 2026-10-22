import type { UiAiThread, UiCommentAttachment, UiCommentSessionOptions } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import type { ThreadsSnapshotPart, ThreadsTransport } from './agent-threads.js'
import { isPinnedThread } from '@histoire/shared'
import { computed, inject, provide, ref } from 'vue'
import { isUiChannelAvailable, onUiDisconnect, onUiEvent, sendUiEvent } from '../util/ui-channel.js'
import { createThreadsModel, isThreadBusy } from './agent-threads.js'
import { createThreadDrafts } from './thread-drafts.js'

/** Extra fields of a reply. */
export interface AiThreadReplyExtra {
  /** Destination when the thread never reached an agent. */
  agentId?: string
  /** Uploaded files. */
  attachments?: UiCommentAttachment[]
  /** Session choices. */
  options?: UiCommentSessionOptions
}

/** Thread snapshot part plus whether canvas pins are enabled. */
export type AiThreadsSnapshotPart = ThreadsSnapshotPart<UiAiThread> & {
  /** `comments.enabled: false` hides the comment tool. */
  pinsEnabled: boolean
}

/** Default transport over the development UI channel. */
function defaultTransport(): ThreadsTransport<UiAiThread, AiThreadsSnapshotPart> {
  return {
    available: isUiChannelAvailable(),
    send: sendUiEvent,
    subscribe: callback => onUiEvent('histoire:ui:ai-threads-snapshot', ({ threads, ...snapshot }) => callback({ ...snapshot, items: threads })),
    stream: callback => onUiEvent('histoire:ui:agent-reply', callback),
    activity: callback => onUiEvent('histoire:ui:agent-activity', callback),
    plan: callback => onUiEvent('histoire:ui:agent-plan', callback),
    disconnect: onUiDisconnect,
  }
}

/**
 * The only conversation store: AI pane threads and canvas pinned threads (comments).
 * @param transport Development channel adapter.
 */
export function createAiThreads(transport: ThreadsTransport<UiAiThread, AiThreadsSnapshotPart> = defaultTransport()) {
  const activeId = ref<string | null>(null)
  /** Archived threads show in the list and as canvas pins. */
  const showArchived = ref(false)
  /** New thread view is open. */
  const composing = ref(false)
  const pinsEnabled = ref(false)
  /** Draft request hooks, bound once the drafts exist (they need the model's channel). */
  const hooks: { snapshot?: (snapshot: AiThreadsSnapshotPart) => void, disconnect?: () => void } = {}
  // Disconnect also releases the pending request, so the composer becomes usable again.
  const model = createThreadsModel<UiAiThread, AiThreadsSnapshotPart>({ ...transport, disconnect: callback => transport.disconnect(() => {
    hooks.disconnect?.()
    callback()
  }) }, { unavailable: 'AI threads unavailable. Reconnect development server.', tooLarge: 'Message exceeds limit. Reduce attached context.' }, (snapshot) => {
    pinsEnabled.value = snapshot.pinsEnabled
    hooks.snapshot?.(snapshot)
  })
  const pinsAvailable = computed(() => model.available.value && pinsEnabled.value)
  const drafts = createThreadDrafts({ send: model.send, items: model.items, activeId, composing, pinsAvailable })
  hooks.snapshot = drafts.receive
  hooks.disconnect = drafts.release
  /** Workbench handler opening a thread where it lives (canvas card or pane). */
  let revealer: ((id: string) => void | Promise<void>) | undefined
  const selectedThread = computed(() => model.items.value.find(thread => thread.id === activeId.value))
  /** Newest first, archived hidden unless requested. */
  /** Newest first: active threads, or only archived ones while the archive is shown. */
  const visible = computed(() => model.items.value.filter(thread => (thread.status === 'resolved') === showArchived.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  return { ...model, ...drafts, threads: model.items, visible, activeId, showArchived, composing, pinsEnabled, pinsAvailable, selectedThread,
    /** Pinned threads in persisted order; pin numbers derive from it. */
    pinned: computed(() => model.items.value.filter(isPinnedThread)),
    /** Threads an agent is working on. */
    working: computed(() => model.items.value.filter(isThreadBusy).length),
    /** Rail badge: threads an agent is working on, or open pinned threads. */
    attention: computed(() => model.items.value.filter(thread => isThreadBusy(thread) || (isPinnedThread(thread) && thread.status !== 'resolved')).length),
    /** Continue an existing conversation. */
    reply(id: string, body: string, extra: AiThreadReplyExtra = {}): boolean {
      return model.send('histoire:ui:ai-thread-reply', { id, body, ...extra })
    },
    /** Archive or restore; archiving the open thread returns to the list. */
    archive(id: string, archived: boolean): boolean {
      const accepted = model.send('histoire:ui:ai-thread-archive', { id, archived })
      if (accepted && archived && activeId.value === id) activeId.value = null
      return accepted
    },
    /** Delete one thread. */
    remove(id: string): boolean {
      const accepted = model.send('histoire:ui:ai-thread-delete', { id })
      if (accepted && activeId.value === id) activeId.value = null
      return accepted
    },
    /** Show one thread and drop any canvas draft. */
    open(id: string): void {
      drafts.draft.value = null
      composing.value = false
      activeId.value = id
    },
    /**
     * Open a thread where it lives, through the handler bound by the workbench.
     * @param id Thread identity.
     */
    async reveal(id: string): Promise<void> {
      await revealer?.(id)
    },
    /**
     * Bind the workbench handler used by `reveal`.
     * @param handler Opens a thread on the canvas or in the pane.
     * @returns Unbind callback.
     */
    bindReveal(handler: (id: string) => void | Promise<void>): () => void {
      revealer = handler
      return () => {
        if (revealer === handler) revealer = undefined
      }
    },
    /** Open the new thread view. */
    compose(): void {
      activeId.value = null
      composing.value = true
    },
    /** Return to the thread list. */
    back(): void {
      activeId.value = null
      composing.value = false
    },
    /** Pin click opens its thread, or minimizes it back to the pin when already open. */
    toggle(id: string): void {
      drafts.draft.value = null
      activeId.value = activeId.value === id ? null : id
    },
    /** Dismiss canvas UI (draft, open pin card); a free-form thread open in the pane stays. */
    dismiss(): void {
      drafts.dismissDraft()
      if (selectedThread.value && isPinnedThread(selectedThread.value)) activeId.value = null
    } }
}

/** Workbench-scoped AI threads state. */
export type AiThreads = ReturnType<typeof createAiThreads>
const key: InjectionKey<AiThreads> = Symbol('AI threads')

/** Install AI threads state. */
export function provideAiThreads(model: AiThreads): void {
  provide(key, model)
}

/** Optional so static books render without AI threads. */
export function useAiThreads(): AiThreads | undefined {
  return inject(key, undefined)
}
