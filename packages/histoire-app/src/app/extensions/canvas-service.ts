import type { CanvasFrameGeometry, CanvasScopedContext, CanvasService, CanvasViewContext, CanvasViewService, Disposer, FrameLease, FrameLeaseOptions, WorkbenchCapability, WorkbenchContext } from '@histoire/plugin-kit'
import type { HistoireRect, HistoireTarget } from '@histoire/protocol'
import type { CanvasFrames } from '../composables/canvas-settings.js'
import type { CanvasStore } from '../stores/canvas.js'
import { createScope } from '@histoire/plugin-kit'
import { effectScope, watch } from 'vue'
import { canvasToClient, clientToCanvas } from '../components/canvas/pan/usePanZoom.js'

/** Inputs of one viewport's canvas service. */
export interface CanvasServiceOptions {
  /** Camera owner of the viewport. */
  canvas: Pick<CanvasStore, 'effectiveZoom' | 'panOffset' | 'viewport'>
  /** Viewport frame registry, including leased frames. */
  frames: CanvasFrames
  /** Viewport element; its client box anchors viewport-local coordinates. */
  viewport: () => HTMLElement | undefined
  /** Plugin frame leases of the viewport. */
  acquireFrame: CanvasService['acquireFrame']
}

/** Canvas service with an explicit lifetime. */
export interface CanvasServiceHandle {
  /** Readonly plugin-facing service. */
  readonly service: CanvasService
  /** Stops change tracking and drops listeners. */
  dispose: () => void
}

/**
 * Read the viewport's client box; falls back to the measured size before mount.
 * @param options Service inputs.
 */
function viewportRect(options: CanvasServiceOptions): HistoireRect {
  const rect = options.viewport()?.getBoundingClientRect()
  return rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : { x: 0, y: 0, ...options.canvas.viewport }
}

/**
 * Create the readonly geometry service of one canvas viewport. Values are read live from the
 * camera and registry; listeners are notified after layout updates (post flush) and after
 * window resize or scroll, which move client boxes without changing canvas state.
 * @param options Camera, registry, viewport element and lease entry point.
 */
export function createCanvasService(options: CanvasServiceOptions): CanvasServiceHandle {
  const listeners = new Set<() => void>()
  const scope = effectScope(true)

  /** Notify a snapshot of listeners, so unsubscribing during delivery is safe. */
  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  scope.run(() => {
    const { canvas, frames } = options
    // Rect objects are replaced on layout changes; reading their fields tracks size changes too.
    watch(() => [canvas.effectiveZoom, canvas.panOffset.x, canvas.panOffset.y, canvas.viewport.width, canvas.viewport.height, [...frames.frames.values()].map(entry => [entry.id, entry.rect, entry.iframe])], notify, { flush: 'post', deep: 1 })
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', notify)
    window.addEventListener('scroll', notify, true)
  }

  const service: CanvasService = Object.freeze({
    get zoom() {
      return options.canvas.effectiveZoom
    },
    get pan() {
      return Object.freeze({ ...options.canvas.panOffset })
    },
    get viewport() {
      return Object.freeze(viewportRect(options))
    },
    toCanvas: point => clientToCanvas(point, options.canvas.effectiveZoom, options.canvas.panOffset),
    toViewport: point => canvasToClient(point, options.canvas.effectiveZoom, options.canvas.panOffset),
    frameToViewport(frameKey, point) {
      const client = options.frames.frameToClient(frameKey, point)
      if (!client || !options.frames.getFrame(frameKey)?.iframe) return null
      const origin = viewportRect(options)
      return { x: client.x - origin.x, y: client.y - origin.y }
    },
    viewportToFrame(frameKey, point) {
      const origin = viewportRect(options)
      return options.frames.clientToFrame(frameKey, { x: point.x + origin.x, y: point.y + origin.y })
    },
    frames: () => [...options.frames.frames.values()].map((entry): CanvasFrameGeometry => Object.freeze({
      frame: Object.freeze({ key: entry.id, target: Object.freeze({ storyId: entry.storyId, variantId: entry.variantId }) }),
      rect: Object.freeze({ x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height }),
    })),
    acquireFrame: (target, leaseOptions) => options.acquireFrame(target, leaseOptions),
    subscribe(listener) {
      const entry = (): void => listener()
      listeners.add(entry)
      return () => void listeners.delete(entry)
    },
  })

  return {
    service,
    dispose() {
      scope.stop()
      listeners.clear()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', notify)
        window.removeEventListener('scroll', notify, true)
      }
    },
  }
}

/** Canvas-scoped context with an explicit lifetime. */
export interface CanvasContextHandle<C extends CanvasScopedContext = CanvasScopedContext> {
  /** Context passed to canvas overlays, tools and views. */
  readonly context: C
  /** Releases subscriptions made through the context. */
  dispose: () => void
}

/**
 * Extend the workbench root context with one viewport's canvas service. Subscriptions made
 * through the context belong to the viewport and are released with it.
 * @param root Root workbench context.
 * @param canvas Canvas service of the viewport (or of one custom view).
 */
export function createCanvasScopedContext<S extends CanvasService>(root: WorkbenchContext, canvas: S): CanvasContextHandle<CanvasScopedContext & { readonly canvas: S }> {
  const owned = new Set<Disposer>()
  let disposed = false

  /** Own one subscription; refused after disposal. */
  function own(subscribe: () => Disposer): Disposer {
    if (disposed) return () => {}
    const stop = subscribe()
    const release = (): void => {
      if (owned.delete(release)) stop()
    }
    owned.add(release)
    return release
  }

  const { source, catalog, navigation, devEvents, tests } = root
  const context: CanvasScopedContext & { readonly canvas: S } = Object.freeze({
    capabilities: new Set<WorkbenchCapability>([...root.capabilities, 'canvas']),
    source,
    catalog,
    navigation,
    ...(devEvents ? { devEvents } : {}),
    ...(tests ? { tests } : {}),
    get selection() {
      return root.selection
    },
    subscribe: listener => own(() => root.subscribe(listener)),
    canvas: overrideService(canvas, { subscribe: listener => own(() => canvas.subscribe(listener)) }),
  })
  return {
    context,
    dispose() {
      disposed = true
      for (const release of [...owned]) release()
    },
  }
}

/**
 * Copy a service's property descriptors (getters stay live, unlike a spread) with some methods
 * replaced or added.
 * @param service Canvas service.
 * @param overrides Replacement or additional methods.
 */
function overrideService<S extends CanvasService, O extends object>(service: S, overrides: O): S & O {
  const properties = Object.getOwnPropertyDescriptors(service)
  const replaced = Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, { value, enumerable: true }]))
  return Object.freeze(Object.defineProperties({}, { ...properties, ...replaced })) as S & O
}

/** Lease entry point of a custom view: `keep` slots stay free for visible admission. */
export type CanvasViewAcquire = (target: HistoireTarget, options: FrameLeaseOptions, keep: number) => Promise<FrameLease>

/**
 * Canvas-scoped context of one mounted custom view. Frames leased through it may take the whole
 * viewport budget (no visible frames render beside a custom view) and belong to the view:
 * `dispose` releases them, withdraws queued requests and refuses later ones, so switching
 * views never leaves orphaned frame sessions, even when the plugin forgets to release.
 * `requestLayout` reaches the viewport only while the view is mounted.
 * @param root Root workbench context.
 * @param canvas Canvas service of the viewport.
 * @param acquire Lease entry point of the viewport.
 * @param requestLayout Asks the viewport to re-read the view's layout.
 */
export function createCanvasViewContext(root: WorkbenchContext, canvas: CanvasService, acquire: CanvasViewAcquire, requestLayout: () => void): CanvasContextHandle<CanvasViewContext> {
  const lifetime = new AbortController()
  const service: CanvasViewService = overrideService(canvas, {
    acquireFrame(target: HistoireTarget, options: FrameLeaseOptions) {
      // Lease signal follows both the view and the caller; aborting releases or withdraws it.
      const { signal } = createScope(lifetime.signal, options.signal)
      return acquire(target, { ...options, signal }, 0)
    },
    requestLayout() {
      if (!lifetime.signal.aborted) requestLayout()
    },
  })
  const scoped = createCanvasScopedContext(root, service)
  return {
    context: scoped.context,
    dispose() {
      lifetime.abort()
      scoped.dispose()
    },
  }
}
