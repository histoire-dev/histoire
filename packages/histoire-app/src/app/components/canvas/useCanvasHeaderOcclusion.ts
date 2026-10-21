import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import { onScopeDispose, ref, watch } from 'vue'
import { canvasOverlayIsOccluded } from './canvas-overlay-occlusion.js'

/** Keep fixed story metadata behind admitted documents and variant labels. */
export function useCanvasHeaderOcclusion(options: {
  /** Fixed metadata element. */
  header: () => HTMLElement | undefined
  /** Owning workbench viewport. */
  viewport: () => HTMLElement | undefined
  /** Camera changes invalidate screen bounds. */
  canvas: CanvasStore
  /** Physical documents currently owned by this canvas. */
  registry: CanvasFrames
  /** Measured header bounds trigger invalidation after chrome resize. */
  bounds: () => unknown
  /** Fixed presentations can keep metadata visible regardless of overlap. */
  enabled?: () => boolean
}) {
  const obscured = ref(false)
  let frame = 0
  let initial = true
  /** Read header, document and label rectangles; forces layout, so callers coalesce it. */
  function measure(): void {
    frame = 0
    if (options.enabled?.() === false) return
    const header = options.header()?.getBoundingClientRect()
    const documents = [...options.registry.frames.values()].flatMap(frame => frame.iframe?.isConnected ? [frame.iframe.getBoundingClientRect()] : [])
    const labels = [...(options.viewport()?.querySelectorAll<HTMLElement>('[data-canvas-overlay-occluder]') ?? [])].filter(label => label.isConnected).map(label => label.getBoundingClientRect())
    obscured.value = Boolean(header && canvasOverlayIsOccluded(header, [...documents, ...labels]))
  }
  watch([
    () => options.enabled?.() ?? true,
    () => [options.canvas.effectiveZoom, options.canvas.panOffset.x, options.canvas.panOffset.y],
    options.bounds,
    () => [...options.registry.frames.values()].map(frame => frame.iframe),
  ], () => {
    if (options.enabled?.() === false) {
      cancelAnimationFrame(frame)
      frame = 0
      obscured.value = false
      return
    }
    // Initial state is read synchronously; pan/zoom bursts share one layout read per frame.
    if (initial) measure()
    else if (!frame) frame = requestAnimationFrame(measure)
    initial = false
  }, { flush: 'post', immediate: true })
  onScopeDispose(() => cancelAnimationFrame(frame))
  return obscured
}
