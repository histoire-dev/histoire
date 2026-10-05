import type { HistoireBridgePublication, HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { HistoireMountContext, HistoireSurfaceConnection } from '../adapters/types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { createBridgeFrame } from '../transport/handshake.js'
import { createBridgePort } from '../transport/port.js'
import { dispatchHistoireSessionCommand } from '../transport/session-commands.js'
import { getBridgeSurfaceRole } from '../transport/validation.js'
import { createMountEventStream } from './events.js'
import { createMountGeometry } from './geometry.js'
import { waitBridgeRuntime } from './handle.js'
import { createMountOverlay } from './overlay.js'
import { createMountViewSnapshot } from './view-snapshot.js'
/** Own iframe and optional hidden container; caller session always stays local. */
export function mountRemoteSurface(context: HistoireMountContext): HistoireSurfaceConnection {
  if (context.container && (!context.container.ownerDocument || context.container.nodeType !== 1 || typeof context.container.append !== 'function')) {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'Surface container must be browser element')
  }
  const document = context.container?.ownerDocument ?? globalThis.document
  if (!document?.body) {
    throw new HistoireSdkError('BROWSER_REQUIRED', 'Surface requires browser document')
  }
  const hidden = context.hidden ? document.createElement('div') : undefined
  if (hidden) {
    // Browsers throttle requestAnimationFrame in far-offscreen child frames,
    // preventing framework readiness. A transparent, non-interactive viewport
    // keeps real layout and frame scheduling while contributing no visible UI.
    hidden.style.cssText = `position:fixed;left:0;top:0;opacity:0;z-index:-2147483647;width:${context.settings.responsiveWidth}px;height:${context.settings.responsiveHeight ?? 560}px;overflow:hidden;pointer-events:none`
    hidden.setAttribute('aria-hidden', 'true')
    document.body.append(hidden)
  }
  const container = context.container ?? hidden!
  if (!container) {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'Surface container required')
  }
  const abort = new AbortController()
  const role = getBridgeSurfaceRole(context.surface)
  let bridge: ReturnType<typeof createBridgePort> | undefined
  let off = () => {
  }
  let stopEvents = () => {}
  let active = true
  let customOnly = false
  const projectSnapshot = createMountViewSnapshot(context.surface)
  const listeners = new Set<Parameters<HistoireSurfaceConnection['subscribe']>[0]>()
  const publications = new Set<(event: HistoireBridgePublication) => void>()
  let synchronize = () => {}
  const source = context.session.getSnapshot().source!
  const id = `${context.mountId}:connection`
  const frame = createBridgeFrame({ url: source.url, sessionId: context.sessionId, mountId: context.mountId, surface: context.surface, role, container, signal: abort.signal, disconnected: () => {
    bridge?.disconnect()
    close()
  } })
  if (hidden) frame.iframe.tabIndex = -1
  const geometry = createMountGeometry(frame.iframe, container, (value) => {
    for (const listener of listeners) listener(value)
  })
  const overlay = createMountOverlay(frame.iframe, (event) => {
    for (const listener of publications) listener(event)
  })
  const connected = frame.ready.then(({ port, ack }) => {
    if (!active) {
      throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface detached')
    }
    if (ack.owner.connectionId !== id) {
      throw new HistoireSdkError('INVALID_ARGUMENT', 'Mismatched surface port identity')
    }
    bridge = createBridgePort({ port, owner: ack.owner, role, descriptor: ack.descriptor, dispatch: (request, signal) => dispatchHistoireSessionCommand(context.session, request.command, request.payload, request, signal), publication: event => overlay.receive(event) })
    bridge.subscribe((value) => {
      const projected = geometry.receive(value)
      for (const listener of listeners) {
        listener(projected)
      }
      // Data and mount ports receive publication independently. Resynchronize
      // once this port owns the new revision, after an earlier intent was stale.
      if (value.type === 'catalog') synchronize()
    })
    return bridge
  })
  const ready = connected.then(async (endpoint): Promise<HistoireRuntimeSnapshot | void> => {
    // Empty/docs-only selection has view readiness but owns no story document.
    const runtimeReady = role === 'primary' && context.target?.variantId != null ? waitBridgeRuntime(endpoint, abort.signal, context.source.descriptor.config?.storyCollectTimeout ?? 30_000) : undefined
    /** Parent snapshot is sole selection/settings controller; event history streams separately. */
    synchronize = () => {
      const snapshot = context.session.getSnapshot()
      if (snapshot.status !== 'ready' || !active) {
        return
      }
      const owner = endpoint.getOwner()
      void endpoint.request('view.sync', projectSnapshot(snapshot), { ...owner, signal: abort.signal }).catch(() => {
      })
    }
    off = context.session.subscribe(synchronize)
    const snapshot = context.session.getSnapshot()
    if (role === 'controls') await endpoint.request('controls.configure', { customOnly }, { ...endpoint.getOwner(), signal: abort.signal })
    await endpoint.request('view.sync', projectSnapshot(snapshot), { ...endpoint.getOwner(), signal: abort.signal })
    stopEvents = createMountEventStream(context.session, (payload, owner) => endpoint.post('events.appended', payload, owner))
    return runtimeReady ? await runtimeReady : undefined
  })
  void ready.catch(() => {
  })
  /** Mark inactive and abort all readiness/requests before releasing owned elements. */
  function close(): void {
    if (!active) {
      return
    }
    active = false
    abort.abort()
    off()
    stopEvents()
    bridge?.close()
    geometry.close()
    overlay.close()
    frame.close()
    hidden?.remove()
    listeners.clear()
    publications.clear()
  }
  return { id, ready, ...(['controls', 'primary'].includes(role)
    ? { channel: {
        configure(value: boolean) { customOnly = value },
        subscribe(listener: (event: HistoireBridgePublication) => void) {
          publications.add(listener)
          return () => {
            publications.delete(listener)
          }
        },
        post(event: 'overlay.result', payload: unknown) {
          overlay.clear()
          const snapshot = context.session.getSnapshot()
          if (active && snapshot.runtime.runtimeId && snapshot.selection) bridge?.post(event, payload, { runtimeId: snapshot.runtime.runtimeId, target: snapshot.selection })
        },
      } }
    : {}), request: async (command, payload, capture) => (await connected).request(command, payload, capture), subscribe(listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, close }
}
