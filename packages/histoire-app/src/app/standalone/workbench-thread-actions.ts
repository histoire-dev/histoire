import type { createContextMenu, WorkbenchContextTarget } from '../composables/context-menu.js'
import type { AiThreads } from '../stores/ai-threads.js'

/** Dependencies of the AI thread row menu actions. */
export interface ThreadActionsOptions {
  /** Workbench context menu registry. */
  menu: ReturnType<typeof createContextMenu>
  /** Threads store. */
  threads: AiThreads
  /** Open a thread where it lives (canvas card or pane). */
  select: (id: string) => void | Promise<void>
  /** Copy text through the frame actions clipboard helper. */
  copyText: (text: string) => void | Promise<void>
}

/**
 * Register thread row menu actions (`comment.*` ids are kept for menu callers).
 * @param options Menu, store and handlers.
 * @returns Unregister callback.
 */
export function registerThreadActions(options: ThreadActionsOptions): () => void {
  const { menu, threads } = options
  /** Thread targeted by a menu, if it still exists. */
  function find(target: WorkbenchContextTarget) {
    return target.kind === 'comment' ? threads.threads.value.find(thread => thread.id === target.key) : undefined
  }
  const offs = [
    menu.register({ id: 'comment.open', label: 'Open thread', icon: 'chat', group: 'open', available: target => Boolean(find(target)), run: async (target) => {
      const thread = find(target)
      if (thread) await options.select(thread.id)
    } }),
    menu.register({ id: 'comment.resolve', label: 'Archive thread', icon: 'checkmark', group: 'comment', available: target => Boolean(find(target) && find(target)!.status !== 'resolved'), run: (target) => {
      const thread = find(target)
      if (thread) threads.archive(thread.id, true)
    } }),
    menu.register({ id: 'comment.reopen', label: 'Restore thread', icon: 'renew', group: 'comment', available: target => find(target)?.status === 'resolved', run: (target) => {
      const thread = find(target)
      if (thread) threads.archive(thread.id, false)
    } }),
    menu.register({ id: 'comment.copy-text', label: 'Copy message text', icon: 'copy', group: 'copy', available: target => Boolean(find(target)), run: (target) => {
      const thread = find(target)
      if (thread) return options.copyText(thread.body)
    } }),
  ]
  return () => offs.forEach(off => off())
}
