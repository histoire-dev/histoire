import type { HistoireSurface } from '@histoire/protocol'
import type { HistoireMount } from '../types.js'
import type { OwnedMount, SessionContext } from './context.js'
import { HistoireSdkError } from '@histoire/protocol'
import { bindHistoireMountChannel } from '../mounts/channel.js'
import { receiveNotification } from './notifications.js'
import { publishRuntime } from './runtime.js'
import { sendCurrentSettings } from './settings.js'

/** Surfaces owning the one canonical story runtime. */
const primarySurfaces = new Set<HistoireSurface>(['explorer', 'preview', 'grid'])
/** Finite surface validation also applies to untyped JavaScript callers. */
const surfaces = new Set<HistoireSurface>(['explorer', 'preview', 'grid', 'tree', 'search', 'toolbar', 'controls', 'docs', 'source', 'events', 'tests'])

/** Mark inactive before awaits; release primary only after complete cleanup. */
function unmount(context: SessionContext, owned: OwnedMount): Promise<void> {
  if (owned.closing) return owned.closing
  owned.active = false
  let observerError: unknown
  const id = owned.handle.id
  context.operations.reject('RUNTIME_CHANGED', 'Surface unmounted.', scope => scope.mountId === id)
  if (context.primaryId === id) {
    context.runtimeVersion++
    context.publish({ state: null, events: { items: [], droppedCount: 0 }, runtime: { ...context.snapshot.runtime, status: 'absent', runtimeId: null, viewports: [], viewport: null } })
  }
  owned.closing = Promise.resolve().then(async () => {
    try {
      await owned.transport.close()
    }
    catch (error) {
      if (observerError) throw new AggregateError([observerError, error], 'Surface teardown failed')
      throw error
    }
    context.mounts.delete(id)
    if (context.primaryId === id) {
      context.primaryId = null
      context.publish({ runtime: { status: 'absent', mountId: null, runtimeId: null, layout: null, viewports: [], viewport: null } })
    }
    if (observerError) throw observerError
  }).catch((error) => {
    // A failed adapter close gives no proof that its runtime stopped. Keep the
    // slot quarantined so replacement cannot execute alongside that document.
    if (context.primaryId === id && context.snapshot.status !== 'disposed') {
      context.publish({ runtime: { ...context.snapshot.runtime, status: 'failed' } })
    }
    throw error
  })
  void owned.closing.catch(() => {})
  // Retire private channels synchronously after cleanup promise exists. Observer
  // failures cannot skip transport teardown or leave primary slot unreleased.
  try {
    owned.unsubscribe()
  }
  catch (error) { observerError = error }
  return owned.closing
}

/** Reserve primary synchronously before invoking any browser/source adapter. */
export function mountSurface(context: SessionContext, container: HTMLElement | undefined, surface: HistoireSurface, hidden = false): HistoireMount {
  const connection = context.assertConnected()
  if (!surfaces.has(surface)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Unknown Histoire surface.')
  const primary = primarySurfaces.has(surface)
  if (primary && context.primaryId !== null) throw new HistoireSdkError('RUNTIME_IN_USE', 'Session already owns a primary runtime.')
  if (!context.engine?.surfaces[surface].available) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', `Source does not support surface ${surface}.`)
  if (!context.adapters.mount) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Surface adapter unavailable.')
  const target = context.snapshot.selection
  const source = context.snapshot.source!
  const selectionVersion = context.selectionVersion
  const requiresRuntime = primary && target?.variantId != null
  const mountId = `${context.sessionId}:mount:${++context.mountCounter}`
  if (primary) context.primaryId = mountId
  let transport
  try {
    transport = context.adapters.mount({ session: context.session!, sessionId: context.sessionId, mountId, surface, hidden, container, source: connection, target, settings: context.snapshot.settings })
  }
  catch (error) {
    if (primary) context.primaryId = null
    throw error
  }
  let owned: OwnedMount
  let closeChannel = () => {}
  const handle: HistoireMount = { id: mountId, ready: Promise.resolve(), unmount: () => unmount(context, owned) }
  owned = { handle, transport, unsubscribe: () => {}, active: true, hidden, runtimeId: null, retiredRuntimeIds: new Set() }
  context.mounts.set(mountId, owned)
  try {
    closeChannel = bindHistoireMountChannel(handle, context.session!, transport.channel)
    owned.unsubscribe = closeChannel
    const stop = transport.subscribe(event => receiveNotification(context, event, mountId))
    owned.unsubscribe = () => {
      try {
        closeChannel()
      }
      finally { stop() }
    }
  }
  catch (error) {
    void unmount(context, owned).catch(() => {})
    throw error
  }
  if (primary) {
    context.publish({ state: null, runtime: { status: 'mounting', mountId, runtimeId: null, layout: surface === 'grid' ? 'grid' : 'single', viewports: [], viewport: null } })
  }
  /** Capture before adapter/publication callbacks; late completion cannot adopt a successor. */
  function assertCurrent(): void {
    context.assertConnected()
    if (context.connection !== connection || context.snapshot.source?.sourceId !== source.sourceId || context.snapshot.source.epoch !== source.epoch || context.snapshot.source.revision !== source.revision) throw new HistoireSdkError('STALE_REVISION', 'Source changed before surface readiness.')
    if (!owned.active || context.mounts.get(mountId) !== owned || (primary && context.primaryId !== mountId) || (requiresRuntime && selectionVersion !== context.selectionVersion)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface owner changed before readiness.')
  }
  handle.ready = context.operations.run({ kind: 'mount', mountId }, async (signal) => {
    const runtime = await transport.ready
    signal.throwIfAborted()
    assertCurrent()
    if (primary && runtime) {
      if (runtime.mountId !== mountId || runtime.status !== 'ready' || !runtime.runtimeId) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Surface did not supply an actual ready runtime.')
      if (!publishRuntime(context, owned, runtime)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface readiness belongs to a retired document.')
      // Runtime publication invokes observers synchronously. Recheck ownership
      // before settings dispatch so that callback cannot transfer this completion.
      signal.throwIfAborted()
      assertCurrent()
      await sendCurrentSettings(context)
      signal.throwIfAborted()
      assertCurrent()
    }
    // Initial data-only mount owns view acknowledgement. Later selection is a
    // separate operation and cannot turn that captured acknowledgement into failure.
    if (requiresRuntime && context.snapshot.runtime.status !== 'ready') throw new HistoireSdkError('PREVIEW_NOT_READY', 'Story runtime is not ready.')
  }, assertCurrent)
  void handle.ready.catch(() => {
    if (owned.active && context.primaryId === mountId && context.snapshot.status === 'ready' && context.connection === connection && context.snapshot.source?.sourceId === source.sourceId && context.snapshot.source.epoch === source.epoch && context.snapshot.source.revision === source.revision && context.snapshot.runtime.status === 'mounting' && selectionVersion === context.selectionVersion) context.publish({ runtime: { ...context.snapshot.runtime, status: 'failed' } })
  })
  return handle
}
