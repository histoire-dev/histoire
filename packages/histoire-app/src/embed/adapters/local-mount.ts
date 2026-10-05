import type { HistoireBridgePublication } from '@histoire/protocol'
import type { HistoireMountContext, HistoireSurfaceConnection } from '@histoire/sdk/internal'
import type { EmbedSurfaceInstance } from '../surfaces.js'
import { HistoireSdkError } from '@histoire/protocol'
import { createBridgePort, dispatchHistoireSessionCommand, getBridgeSurfaceRole } from '@histoire/sdk/internal'
import { mountEmbedSurface } from '../surfaces.js'

/** Local standalone uses same finite ports/runtime implementation without public embed endpoints. */
export function mountLocalHistoireSurface(context: HistoireMountContext, sourceBase: string, standalone = false): HistoireSurfaceConnection {
  const document = context.container?.ownerDocument ?? globalThis.document
  if (!document?.body) throw new HistoireSdkError('BROWSER_REQUIRED', 'Surface requires browser document')
  const root = document.createElement('div')
  root.style.cssText = context.hidden
    ? `position:fixed;left:0;top:0;opacity:0;z-index:-2147483647;width:${context.settings.responsiveWidth}px;height:${context.settings.responsiveHeight ?? 560}px;pointer-events:none`
    : 'width:100%;height:100%;min-width:0;'
  ;
  (context.container ?? (context.hidden ? document.body : undefined))?.append(root)
  if (!root.isConnected) throw new HistoireSdkError('INVALID_ARGUMENT', 'Surface container required')
  const abort = new AbortController()
  const ports = new MessageChannel()
  const role = getBridgeSurfaceRole(context.surface)
  const descriptor = context.source.descriptor
  const owner = { protocolVersion: 1 as const, sessionId: context.sessionId, mountId: context.mountId, connectionId: `${context.mountId}:connection`, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision }
  const publications = new Set<(event: HistoireBridgePublication) => void>()
  let active = true
  let customOnly = false
  let instance: EmbedSurfaceInstance | undefined
  let acquired: Promise<EmbedSurfaceInstance>
  let closing: Promise<void> | undefined
  const parent = createBridgePort({ port: ports.port1, owner, role, descriptor, dispatch: (request, signal) => dispatchHistoireSessionCommand(context.session, request.command, request.payload, request, signal), publication: (event) => {
    for (const listener of publications) listener(event)
  } })
  const child = createBridgePort({ port: ports.port2, owner, role, child: true, descriptor, publication: event => instance?.publication?.(event), dispatch: async (request, signal) => {
    if (request.command === 'view.sync') return null
    const view = await acquired
    if (!active || !view.request) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Surface has no runtime dispatcher')
    return view.request(request.command, request.payload, { ...request, signal: AbortSignal.any([abort.signal, signal]) })
  } })
  /** Both endpoints advance in-process before direct runtime observers publish readiness. */
  function synchronizeSelection() {
    if (!active) return
    const snapshot = context.session.getSnapshot()
    if (snapshot.status !== 'ready' || !snapshot.source) return
    const authority = { ...owner, sourceId: snapshot.source.sourceId, epoch: snapshot.source.epoch, revision: snapshot.source.revision }
    const cause = parent.synchronizeSelection(snapshot.selection, authority)
    child.synchronizeSelection(snapshot.selection, authority, cause)
  }
  // Native MessageChannel delivery is asynchronous. Posting view.sync cannot
  // establish child authority before a synchronous runtime observer publishes.
  const stopSelection = context.session.subscribe(synchronizeSelection)
  synchronizeSelection()
  // Defer factory until SDK has reserved ownership/subscriptions and native
  // controls can request replica-only UI before first render.
  acquired = Promise.resolve().then(() => {
    abort.signal.throwIfAborted()
    instance = mountEmbedSurface(context.surface, { container: root, session: context.session, bridge: child, descriptor, signal: abort.signal, sourceBase, controlsCustomOnly: customOnly, standalone })
    return instance
  })
  const ready = acquired.then(view => view.ready)
  void ready.catch(() => {})
  let off = () => {}
  try {
    off = context.source.subscribe((event) => {
      if (!active) return
      if (event.type === 'catalog') child.post('catalog.changed', { descriptor: event.descriptor }, { revision: event.revision })
      if (event.type === 'disconnect') {
        child.post('source.disconnected', {})
        void close().catch(() => {})
      }
    })
  }
  catch (error) {
    void close().catch(() => {})
    throw error
  }
  /** Abort intent first; join allocated view cleanup before primary slot release. */
  function close(): Promise<void> {
    if (closing) return closing
    active = false
    abort.abort()
    closing = Promise.resolve().then(async () => {
      const errors: unknown[] = []
      for (const cleanup of [stopSelection, () => parent.close(), () => child.close(), off]) {
        try {
          cleanup()
        }
        catch (error) {
          errors.push(error)
        }
      }
      const view = await acquired.catch(() => undefined)
      try {
        await view?.close()
      }
      catch (error) {
        errors.push(error)
      }
      finally {
        root.remove()
        publications.clear()
      }
      if (errors.length) throw new AggregateError(errors, 'Local surface cleanup failed')
    })
    void closing.catch(() => {})
    return closing
  }
  return { id: owner.connectionId, ready,
    /** Nested proxy captures source/runtime/target; this port owns connection/generation. */
    request(command, payload, capture) {
      const { connectionId, mountId, selectionVersion } = parent.getOwner()
      return parent.request(command, payload, { ...capture, connectionId, mountId, selectionVersion })
    }, subscribe: parent.subscribe, close, channel: ['controls', 'primary'].includes(role)
      ? {
          configure(value) {
            customOnly = value
          },
          subscribe(listener) {
            publications.add(listener)
            return () => {
              publications.delete(listener)
            }
          },
          post(event, payload) {
            const snapshot = context.session.getSnapshot()
            if (active && snapshot.runtime.runtimeId && snapshot.selection) parent.post(event, payload, { runtimeId: snapshot.runtime.runtimeId, target: snapshot.selection })
          },
        }
      : undefined }
}
