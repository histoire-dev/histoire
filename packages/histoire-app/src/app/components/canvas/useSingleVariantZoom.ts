import type { Ref } from 'vue'
import type { CanvasStore } from '../../stores/canvas.js'
import type { CanvasPoint, CanvasRect, CanvasSize } from './pan/usePanZoom.js'
import { nextTick, onBeforeUnmount, watch } from 'vue'

/** Keep native scroll coordinates anchored while scaling the selected document. */
export function useSingleVariantZoom(canvas: CanvasStore, surface: Ref<HTMLElement | undefined>, options: {
  /** Scroll surface origin within the canvas. */
  area: () => CanvasRect
  /** Unscaled iframe dimensions, independent of zoom. */
  size: () => CanvasSize | undefined
  /** Replacement variants retire pending scroll adjustments. */
  frameId: () => string | undefined
}) {
  let revision = 0
  /** Fit and replacement documents start at their reachable leading edge. */
  function resetScroll() {
    if (surface.value) {
      surface.value.scrollLeft = 0
      surface.value.scrollTop = 0
    }
  }
  const stopZoom = canvas.onSingleZoom((zoom, cursor, fit) => {
    const element = surface.value
    const frame = element?.querySelector<HTMLElement>('.histoire-canvas-frame')
    const size = options.size()
    if (!element || !frame || !size) return
    const current = ++revision
    const rect = element.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const point: CanvasPoint = cursor
      ? { x: cursor.x - options.area().x, y: cursor.y - options.area().y }
      : { x: element.clientWidth / 2, y: element.clientHeight / 2 }
    // Read the displayed scale: successive wheel events can arrive before Vue patches the DOM.
    const scale = frameRect.width / size.width
    const anchor = scale > 0 ? { x: (rect.left + point.x - frameRect.left) / scale, y: (rect.top + point.y - frameRect.top) / scale } : undefined
    void nextTick(() => {
      if (revision !== current || surface.value !== element || !frame.isConnected) return
      if (fit) return resetScroll()
      if (!anchor) return
      const next = frame.getBoundingClientRect()
      // Centering changes the frame origin; browser clamps scroll to reachable content.
      element.scrollLeft += next.left - rect.left + anchor.x * zoom - point.x
      element.scrollTop += next.top - rect.top + anchor.y * zoom - point.y
    })
  })
  const stopFrame = watch(options.frameId, () => {
    const current = ++revision
    void nextTick(() => {
      if (revision === current) resetScroll()
    })
  }, { flush: 'sync', immediate: true })
  onBeforeUnmount(() => {
    revision++
    stopZoom()
    stopFrame()
  })
}
