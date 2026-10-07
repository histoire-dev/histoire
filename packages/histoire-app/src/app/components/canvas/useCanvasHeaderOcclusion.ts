import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import { ref, watch } from 'vue'
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
}) {
  const obscured = ref(false)
  watch([
    () => [options.canvas.effectiveZoom, options.canvas.panOffset.x, options.canvas.panOffset.y],
    options.bounds,
    () => [...options.registry.frames.values()].map(frame => frame.iframe),
  ], () => {
    const header = options.header()?.getBoundingClientRect()
    const documents = [...options.registry.frames.values()].flatMap(frame => frame.iframe?.isConnected ? [frame.iframe.getBoundingClientRect()] : [])
    const labels = [...(options.viewport()?.querySelectorAll<HTMLElement>('[data-canvas-overlay-occluder]') ?? [])].filter(label => label.isConnected).map(label => label.getBoundingClientRect())
    obscured.value = Boolean(header && canvasOverlayIsOccluded(header, [...documents, ...labels]))
  }, { flush: 'post', immediate: true })
  return obscured
}
