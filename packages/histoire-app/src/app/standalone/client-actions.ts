import type { HistoireSession } from '@histoire/sdk/internal'
import type { ClientCommand, ClientCommandContext } from '@histoire/shared'
import { HistoireSdkError } from '@histoire/protocol'
import { OperationOwner } from '@histoire/sdk/internal'
import { createEditableCommandState } from './editable-state.js'

/** Stable ownership signature excludes state, permitting unrelated live edits while callbacks await. */
function owner(snapshot: ReturnType<HistoireSession['getSnapshot']>): string {
  return JSON.stringify([snapshot.status, snapshot.stale, snapshot.source, snapshot.selection, snapshot.runtime.mountId, snapshot.runtime.runtimeId, snapshot.runtime.status])
}

/** Standalone callbacks run locally; resulting serializable intent uses existing finite runtime API. */
export function createStandaloneClientActions(session: HistoireSession) {
  const operations = new OperationOwner()
  let active = true
  let currentOwner = owner(session.getSnapshot())
  const off = session.subscribe((snapshot) => {
    const next = owner(snapshot)
    if (next === currentOwner) return
    currentOwner = next
    operations.reject(snapshot.status === 'disposed' ? 'DISPOSED' : snapshot.status !== 'ready' || snapshot.stale ? 'NOT_CONNECTED' : 'RUNTIME_CHANGED', 'Command source, target or runtime changed.')
  })
  /** Await callback once, then patch only its edits while original source/document still owns them. */
  function execute(command: ClientCommand, params: Record<string, any>, context: ClientCommandContext, notify?: () => void): Promise<unknown> {
    const captured = session.getSnapshot()
    const identity = owner(captured)
    /** Guard both async callback and final patch; retired commands never write replacement runtime. */
    function guard() {
      if (!active) throw new HistoireSdkError('DISPOSED', 'Standalone commands are closed.')
      const snapshot = session.getSnapshot()
      if (snapshot.status !== 'ready' || snapshot.stale) throw new HistoireSdkError(snapshot.status === 'disposed' ? 'DISPOSED' : 'NOT_CONNECTED', 'Command source is unavailable.')
      if (owner(snapshot) !== identity) throw new HistoireSdkError('RUNTIME_CHANGED', 'Command target or runtime changed.')
    }
    return operations.run({ kind: 'runtime', mountId: captured.runtime.mountId ?? undefined }, async (signal) => {
      const state = captured.state ? createEditableCommandState(captured.state.value) : null
      const variant = context.currentVariant ? { ...context.currentVariant, state: state?.value ?? Object.freeze({}) } : undefined
      const story = context.currentStory ? { ...context.currentStory, variants: context.currentStory.variants.map(item => item.id === variant?.id ? variant : item) } : undefined
      // Existing dev-command notification belongs to same initial owner guard,
      // so a disconnected session cannot dispatch a server action first.
      notify?.()
      const result = await command.clientAction?.(params, { ...context, currentStory: story, currentVariant: variant } as ClientCommandContext)
      signal.throwIfAborted()
      guard()
      const patch = state?.patch()
      if (patch) {
        if (captured.runtime.status !== 'ready' || !captured.runtime.runtimeId || !captured.selection?.variantId) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Command edits require a selected ready primary preview.')
        await session.state.patch(patch)
      }
      return result
    }, guard)
  }
  return { execute, close() {
    if (!active) return
    active = false
    off()
    operations.reject('DISPOSED', 'Standalone commands are closed.')
  } }
}
