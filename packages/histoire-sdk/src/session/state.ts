import type { HistoireStateSnapshot } from '@histoire/protocol'
import type { SessionContext } from './context.js'
import { HistoireSdkError, validateHistoireStateSnapshot, validateWireValue } from '@histoire/protocol'
import { request, waitForRuntime } from './request.js'

/** Require explicitly owned selected runtime; no hidden automatic story mount. */
export function primaryRuntime(context: SessionContext) {
  context.selected()
  const primary = context.primaryId ? context.mounts.get(context.primaryId) : undefined
  if (!primary?.active || context.snapshot.runtime.status !== 'ready' || !context.snapshot.runtime.runtimeId) throw new HistoireSdkError('PREVIEW_NOT_READY', 'A selected ready primary preview is required.')
  return primary
}

/** Accept only authoritative state for currently captured document/selection. */
function publishState(context: SessionContext, state: HistoireStateSnapshot): HistoireStateSnapshot {
  validateHistoireStateSnapshot(state)
  if (!state || state.runtimeId !== context.snapshot.runtime.runtimeId || state.target.storyId !== context.snapshot.selection?.storyId || state.target.variantId !== context.snapshot.selection.variantId) {
    throw new HistoireSdkError('RUNTIME_CHANGED', 'State reply belongs to another runtime or target.')
  }
  const cleaned = context.copy(state)
  context.publish({ state: cleaned })
  return cleaned
}

/** Request canonical runtime state; host mirror is never initialization source. */
export async function getState(context: SessionContext): Promise<HistoireStateSnapshot> {
  const primary = primaryRuntime(context)
  context.assertCapability('state')
  return publishState(context, await request(context, primary.transport, 'state.get', {}, { kind: 'runtime', mountId: primary.handle.id }))
}

/** Keep only explicit user patch during reload; captured target may not drift. */
export async function patchState(context: SessionContext, patch: Record<string, unknown>): Promise<void> {
  context.selected()
  context.assertCapability('state')
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HistoireSdkError('INVALID_ARGUMENT', 'State patch must be a plain object.')
  if (Object.hasOwn(patch, '_hPropDefs')) throw new HistoireSdkError('INVALID_ARGUMENT', 'Derived control definitions belong to runtime.')
  validateWireValue(patch, { kind: 'request', name: 'state.patch' })
  const capturedPatch = context.copy(patch)
  const primary = context.primaryId ? context.mounts.get(context.primaryId) : undefined
  if (!primary?.active) throw new HistoireSdkError('PREVIEW_NOT_READY', 'A primary preview is required.')
  if (!['ready', 'mounting'].includes(context.snapshot.runtime.status)) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Preview is unavailable; explicit reload is required.')
  const connection = context.connection
  const source = context.snapshot.source!
  const selectionVersion = context.selectionVersion
  const runtimeVersion = context.runtimeVersion
  /** Readiness and mutation admission retain original source, target and attachment. */
  function assertCurrent(): void {
    context.assertConnected()
    if (connection !== context.connection || context.snapshot.source?.sourceId !== source.sourceId || context.snapshot.source.epoch !== source.epoch || context.snapshot.source.revision !== source.revision) throw new HistoireSdkError('STALE_REVISION', 'Patch source changed before readiness.')
    if (selectionVersion !== context.selectionVersion || runtimeVersion !== context.runtimeVersion || !primary!.active || context.mounts.get(primary!.handle.id) !== primary || context.primaryId !== primary!.handle.id) throw new HistoireSdkError('RUNTIME_CHANGED', 'Patch target changed before readiness.')
  }
  if (context.snapshot.runtime.status !== 'ready') {
    await context.operations.run({ kind: 'selection', mountId: primary.handle.id }, signal => waitForRuntime(context, signal), assertCurrent)
  }
  // OperationOwner settles its waiter before this async service resumes. A source
  // publication in that microtask gap must reject caller edit instead of recapturing it.
  assertCurrent()
  primaryRuntime(context)
  const result = await request<HistoireStateSnapshot | void>(context, primary.transport, 'state.patch', capturedPatch, { kind: 'runtime', mountId: primary.handle.id })
  assertCurrent()
  if (result) publishState(context, result)
}

/** Runtime retains its baseline and live callbacks; SDK requests reset only. */
export async function resetState(context: SessionContext): Promise<void> {
  const primary = primaryRuntime(context)
  context.assertCapability('state')
  const result = await request<HistoireStateSnapshot | void>(context, primary.transport, 'state.reset', {}, { kind: 'runtime', mountId: primary.handle.id })
  if (result) publishState(context, result)
}
