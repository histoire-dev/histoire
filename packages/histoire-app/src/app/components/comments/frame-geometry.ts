import type { Ref } from 'vue'
import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import { onBeforeUnmount, watch } from 'vue'

/**
 * Bumps `tick` whenever projected frame geometry may have changed: camera pan/zoom,
 * frame registration, logical frame rect (variant viewport size, layout) or the
 * actual iframe box (CSS transitions finishing after the logical change).
 * @param canvas Canvas store owning pan and zoom.
 * @param frames Mounted frame registry.
 * @param tick Counter read by overlay projections.
 */
export function useFrameGeometryTick(canvas: CanvasStore, frames: CanvasFrames, tick: Ref<number>): void {
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => tick.value++)
  let observed: HTMLIFrameElement[] = []
  watch(() => [canvas.panOffset.x, canvas.panOffset.y, canvas.effectiveZoom, ...[...frames.frames.values()].flatMap(frame => [frame.iframe, frame.documentId, frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height])], () => {
    tick.value++
    // Re-observe the current iframe set; detached iframes stop reporting.
    const iframes = [...frames.frames.values()].flatMap(frame => frame.iframe ? [frame.iframe] : [])
    if (observer && (iframes.length !== observed.length || iframes.some((iframe, index) => iframe !== observed[index]))) {
      observer.disconnect()
      for (const iframe of iframes) observer.observe(iframe)
      observed = iframes
    }
  }, { flush: 'post', immediate: true })
  onBeforeUnmount(() => observer?.disconnect())
}
