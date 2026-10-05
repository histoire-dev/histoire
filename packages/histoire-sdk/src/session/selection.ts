import type { HistoireCatalog, HistoireSelectionInput, HistoireTarget } from '@histoire/protocol'
import type { OwnedMount, SessionContext } from './context.js'
import { HistoireSdkError } from '@histoire/protocol'
import { request, waitForRuntime } from './request.js'
import { publishRuntime } from './runtime.js'
import { assertVariant } from './variant.js'

/** Validate exact IDs before changing remembered selection or runtime owner. */
export function resolveSelection(context: SessionContext, input: HistoireSelectionInput): HistoireTarget {
  if (!input || typeof input !== 'object') throw new HistoireSdkError('INVALID_ARGUMENT', 'Selection must name a story.')
  const story = context.story(input.storyId)
  if (input.variantId !== undefined && input.variantId !== null && typeof input.variantId !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Variant ID must be a string or null.')
  let variantId = input.variantId
  if (variantId === undefined) {
    const remembered = context.remembered.get(story.id)
    variantId = remembered && story.variants.some(variant => variant.id === remembered) ? remembered : story.variants[0]?.id ?? null
  }
  if (variantId !== null) assertVariant(story, variantId)
  return { storyId: story.id, variantId }
}

/** Await actual selected document without issuing another selection execution. */
async function waitSelectionRuntime(context: SessionContext, primary: OwnedMount): Promise<void> {
  const version = context.selectionVersion
  const connection = context.connection
  const source = context.snapshot.source!
  await context.operations.run({ kind: 'selection', mountId: primary.handle.id }, signal => waitForRuntime(context, signal), () => {
    context.assertConnected()
    if (connection !== context.connection || source.epoch !== context.snapshot.source?.epoch || source.revision !== context.snapshot.source.revision) throw new HistoireSdkError('STALE_REVISION', 'Source changed before selection readiness.')
    if (!primary.active || version !== context.selectionVersion) throw new HistoireSdkError('RUNTIME_CHANGED', 'Selection changed before runtime readiness.')
  })
}

/** Publish validated intent synchronously; matching callers retain its owned ACK. */
export async function select(context: SessionContext, target: HistoireTarget): Promise<void> {
  const previous = context.snapshot.selection
  const primary = context.primaryId ? context.mounts.get(context.primaryId) : undefined
  if (previous?.storyId === target.storyId && previous.variantId === target.variantId) {
    if (target.variantId === null || !primary) return
    if (!primary.active && context.snapshot.runtime.status === 'absent') return
    if (context.snapshot.runtime.status === 'ready' && context.snapshot.runtime.runtimeId) return
    if (!primary.active || context.snapshot.runtime.status !== 'mounting') throw new HistoireSdkError('PREVIEW_NOT_READY', 'Selected preview is unavailable; explicit remount is required.')
    await waitSelectionRuntime(context, primary)
    return
  }
  const connection = context.connection
  const source = context.snapshot.source!
  context.selectionVersion++
  context.runtimeVersion++
  const version = context.selectionVersion
  /** Every publication/await stays owned by this original source and selection. */
  function assertCurrent(): void {
    context.assertConnected()
    if (connection !== context.connection || source.epoch !== context.snapshot.source?.epoch || source.revision !== context.snapshot.source.revision) throw new HistoireSdkError('STALE_REVISION', 'Source superseded during selection.')
    if (version !== context.selectionVersion) throw new HistoireSdkError('RUNTIME_CHANGED', 'Selection superseded during publication.')
  }
  context.operations.reject('RUNTIME_CHANGED', 'Selected target changed.', scope => scope.kind === 'runtime' || scope.kind === 'selection')
  if (target.variantId !== null) context.remembered.set(target.storyId, target.variantId)
  context.publish({
    selection: context.copy(target),
    state: null,
    events: { items: [], droppedCount: 0 },
    runtime: primary?.active ? { ...context.snapshot.runtime, status: 'mounting', runtimeId: null, viewports: [], viewport: null } : context.snapshot.runtime,
  })
  // Snapshot observers may synchronously accept another target before request
  // admission. Never capture that successor as ownership for this old intent.
  assertCurrent()
  if (!primary?.active) return
  const runtime = await request(context, primary.transport, 'selection.select', target, { kind: 'selection', mountId: primary.handle.id })
  assertCurrent()
  // Selection adapters resolve only after the new document is ready and may
  // return its identity. Legacy adapters publish the same identity as notification.
  if (runtime && typeof runtime === 'object' && 'status' in runtime && 'runtimeId' in runtime) {
    if (!publishRuntime(context, primary, runtime as typeof context.snapshot.runtime)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Selection reply belongs to a retired document.')
  }
  assertCurrent()
  if (target.variantId !== null && context.snapshot.runtime.status !== 'ready') {
    await waitSelectionRuntime(context, primary)
    assertCurrent()
  }
}

/** Completed catalog changes cannot retain a removed/ambiguous target. */
export function reconcileSelection(context: SessionContext, catalog: HistoireCatalog = context.snapshot.catalog): HistoireTarget | null {
  const current = context.snapshot.selection
  if (!current) return null
  const matches = catalog.stories.filter(story => story.id === current.storyId)
  if (matches.length !== 1) return null
  if (current.variantId === null) return current
  const variants = matches[0].variants.filter(variant => variant.id === current.variantId)
  if (variants.length === 1) return current
  if (variants.length > 1) return null
  context.remembered.delete(current.storyId)
  const first = matches[0].variants[0]?.id ?? null
  if (first !== null && matches[0].variants.filter(variant => variant.id === first).length !== 1) return null
  return { storyId: current.storyId, variantId: first }
}
