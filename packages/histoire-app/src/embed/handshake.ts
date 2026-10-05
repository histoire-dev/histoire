import type { HistoireBridgeAck, HistoireBridgeIdentity, HistoireSnapshot, HistoireSurface } from '@histoire/protocol'
import type { EmbedSourceConnection } from './types.js'
import { HistoireSdkError, negotiateHistoireProtocol, validateEmbedOrigin, validateHistoireHello } from '@histoire/protocol'
import { createBridgePort, getBridgeSurfaceRole } from '@histoire/sdk/internal'
import { dispatchEmbedCommand, projectEmbedDescriptor } from './commands.js'
import { createEmbedDocumentLifecycle } from './lifecycle.js'
import { assertEmbedSurface, mountEmbedSurface } from './surfaces.js'
import { createParentViewSession } from './view-session.js'
/** Install immediately so descriptor fetch cannot lose initial parent hello. */
export function installEmbedHandshake(sourcePromise: Promise<EmbedSourceConnection>, window: Window = globalThis.window) {
  const lifecycle = createEmbedDocumentLifecycle(window)
  void sourcePromise.then(source => lifecycle.add(() => source.close())).catch(() => {})
  const hints = new URL(window.location.href).searchParams
  const surface = hints.get('view') === 'surface' ? hints.get('surface') as HistoireSurface : undefined
  let claimed = false
  /** Exact parent frame/origin/hints and exactly one transferred port establish trust. */
  async function receive(event: MessageEvent): Promise<void> {
    if (lifecycle.signal.aborted || claimed || event.source !== window.parent || event.source === window || event.ports.length !== 1) {
      for (const port of event.ports) {
        port.close()
      }
      return
    }
    const port = event.ports[0]
    let hello
    try {
      hello = validateHistoireHello(event.data)
    }
    catch {
      port.close()
      return
    }
    const range = { min: 1, max: 1 }
    try {
      const parentOrigin = validateEmbedOrigin(event.origin)
      if (hello.parentOrigin !== parentOrigin || hints.get('parentOrigin') !== parentOrigin || hints.get('sessionId') !== hello.sessionId || hints.get('mountId') !== hello.mountId || hello.role !== (surface ? getBridgeSurfaceRole(surface) : 'data')) {
        throw new HistoireSdkError('ORIGIN_DENIED', 'Parent bootstrap does not match actual frame')
      }
      claimed = true
      const source = await sourcePromise
      lifecycle.signal.throwIfAborted()
      if (parentOrigin !== window.location.origin && !source.allowedOrigins.includes(parentOrigin)) {
        throw new HistoireSdkError('ORIGIN_DENIED', 'Parent origin is not allowed')
      }
      const protocolVersion = negotiateHistoireProtocol(hello.protocolRange, range)
      if (surface) {
        assertEmbedSurface(surface)
      }
      const descriptor = projectEmbedDescriptor(source.descriptor, parentOrigin, window.location.origin)
      const owner: HistoireBridgeIdentity = { protocolVersion, sessionId: hello.sessionId, mountId: hello.mountId, connectionId: surface ? `${hello.mountId}:connection` : `${hello.mountId}:connection:${hello.nonce}`, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision }
      let view: ReturnType<typeof createParentViewSession> | undefined
      let instance: ReturnType<typeof mountEmbedSurface> | undefined
      let controlsCustomOnly = false
      const bridge = createBridgePort({ port, owner, role: hello.role, child: true, descriptor, publication: (event) => {
        if (event.event === 'events.appended' && view) {
          const payload = event.payload as { items: import('@histoire/protocol').HistoireEvent[], reset?: boolean, droppedCount?: number }
          if (payload.reset) view.clearEvents(payload.droppedCount)
          else if (payload.droppedCount) view.dropEvents(payload.droppedCount)
          for (const item of payload.items) view.event(item)
        }
        instance?.publication?.(event)
      }, async dispatch(request, requestSignal) {
        if (request.command === 'controls.configure' && surface === 'controls' && !instance) {
          controlsCustomOnly = (request.payload as { customOnly: boolean }).customOnly
          return null
        }
        if (request.command === 'view.sync' && view && surface) {
          view.synchronize(request.payload as HistoireSnapshot)
          if (!instance) {
            instance = mountEmbedSurface(surface, { container: window.document.body, session: view.session, bridge, descriptor, signal: lifecycle.signal, controlsCustomOnly, sourceBase: new URL('./', window.location.href).href })
            lifecycle.add(() => instance?.close())
            const capture = { ...bridge.getOwner(), target: view.session.getSnapshot().selection ?? undefined }
            /** First readiness cannot adopt a later source, target or document. */
            function currentReadiness(runtimeId = capture.runtimeId) {
              const current = bridge.getOwner()
              const target = view!.session.getSnapshot().selection
              return !lifecycle.signal.aborted && current.connectionId === capture.connectionId
                && current.sourceId === capture.sourceId && current.epoch === capture.epoch && current.revision === capture.revision
                && current.selectionVersion === capture.selectionVersion && (current.runtimeId ?? null) === (runtimeId ?? null)
                && target?.storyId === capture.target?.storyId && target?.variantId === capture.target?.variantId
            }
            void instance.ready.then((runtime) => {
              if (runtime && runtime.mountId === capture.mountId && currentReadiness(runtime.runtimeId ?? undefined)) {
                bridge.post('readiness.changed', { runtime }, { ...capture, runtimeId: runtime.runtimeId ?? undefined })
              }
            }).catch((error) => {
              // Docs/null retires the first promise while the surface stays live.
              if (!(error instanceof HistoireSdkError && error.code === 'RUNTIME_CHANGED') && currentReadiness()) {
                bridge.post('readiness.changed', { runtime: { status: 'failed', mountId: capture.mountId, runtimeId: capture.runtimeId ?? null, layout: null, viewports: [], viewport: null } }, capture)
              }
            })
            await instance.ready
          }
          return null
        }
        return dispatchEmbedCommand(source, parentOrigin, window.location.origin, request, AbortSignal.any([lifecycle.signal, requestSignal]), instance)
      } })
      if (surface) {
        view = createParentViewSession(bridge, lifecycle.signal, () => projectEmbedDescriptor(source.descriptor, parentOrigin, window.location.origin))
      }
      lifecycle.add(() => {
        bridge.post('source.disconnected', {})
        bridge.close()
        view?.close()
      })
      const off = source.subscribe((notification) => {
        if (lifecycle.signal.aborted) {
          return
        }
        if (notification.type === 'catalog') {
          bridge.post('catalog.changed', { descriptor: projectEmbedDescriptor(notification.descriptor, parentOrigin, window.location.origin) }, { revision: notification.revision })
        }
        else if (notification.type === 'disconnect') {
          bridge.post('source.disconnected', {})
          void lifecycle.close()
        }
      })
      lifecycle.add(off)
      const ack: HistoireBridgeAck = { kind: 'histoire:ack', nonce: hello.nonce, protocolRange: range, ok: true, owner, descriptor }
      port.postMessage(ack)
      window.removeEventListener('message', listener)
    }
    catch (error) {
      const ack: HistoireBridgeAck = { kind: 'histoire:ack', nonce: hello.nonce, protocolRange: range, ok: false, error: { code: error instanceof HistoireSdkError ? error.code : 'BOOK_UNAVAILABLE', message: error instanceof HistoireSdkError ? error.message : 'Source unavailable' } }
      port.postMessage(ack)
      port.close()
      claimed = false
    }
  }
  /** Observe rejected setup work without leaving unhandled promises on navigation. */
  function listener(event: MessageEvent): void {
    void receive(event).catch(() => {
    })
  }
  window.addEventListener('message', listener)
  lifecycle.add(() => window.removeEventListener('message', listener))
  return lifecycle
}
