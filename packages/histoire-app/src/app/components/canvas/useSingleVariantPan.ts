import type { Ref } from 'vue'
import type { CanvasPoint, CanvasRect, CanvasSize } from './pan/usePanZoom.js'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/** Narrow scroll adapter exposed by the single-variant component. */
export interface SingleVariantPan {
  /** A selected frame overflows at least one visible axis without an active resize. */
  canPan: boolean
  /** Read native scroll as the shared controller's client-pixel translation. */
  getOffset: () => CanvasPoint
  /** Clamp a new translation to the selected frame's overflow. */
  setOffset: (offset: CanvasPoint) => void
}

/** Geometry inputs remain owned by single-mode sizing and zoom. */
interface SingleVariantPanOptions {
  /** Logical frame dimensions; absent when no variant is selected. */
  size: () => CanvasSize | undefined
  /** Current document display scale. */
  zoom: () => number
  /** Available area changes require measurement after the DOM update. */
  area: () => CanvasRect
  /** Frame resizing has exclusive pointer ownership. */
  resizing: () => boolean
}

/** Adapt bounded native scrolling to existing pointer pan without moving saved cameras. */
export function useSingleVariantPan(surface: Ref<HTMLElement | undefined>, options: SingleVariantPanOptions) {
  const visible = shallowRef<CanvasSize>({ width: 0, height: 0 })
  const limits = computed(() => {
    const size = options.size()
    return {
      x: size ? Math.max(0, size.width * options.zoom() - visible.value.width) : 0,
      y: size ? Math.max(0, size.height * options.zoom() - visible.value.height) : 0,
    }
  })
  const canPan = computed(() => !!surface.value && visible.value.width > 0 && visible.value.height > 0
    && !options.resizing() && (limits.value.x > 0 || limits.value.y > 0))
  let observer: ResizeObserver | undefined
  let observed: HTMLElement | undefined

  /** Negative scroll makes frame motion follow pointer deltas in client pixels. */
  function getOffset(): CanvasPoint {
    return { x: -(surface.value?.scrollLeft ?? 0), y: -(surface.value?.scrollTop ?? 0) }
  }

  /** Logical scaled dimensions exclude resize grips that inflate DOM scroll extents. */
  function setOffset(offset: CanvasPoint): void {
    const element = surface.value
    if (!element) return
    element.scrollLeft = Math.min(limits.value.x, Math.max(0, -offset.x))
    element.scrollTop = Math.min(limits.value.y, Math.max(0, -offset.y))
  }

  /** Read inner dimensions so scrollbar reservations participate in both axis bounds. */
  function measure(): void {
    const element = surface.value
    if (observed !== element) {
      if (observed) observer?.unobserve(observed)
      observed = element
      if (element) observer?.observe(element)
    }
    const width = element?.clientWidth ?? 0
    const height = element?.clientHeight ?? 0
    if (visible.value.width !== width || visible.value.height !== height) visible.value = { width, height }
    setOffset(getOffset())
  }

  watch([surface, () => options.size()?.width, () => options.size()?.height, options.zoom, options.area], measure, { flush: 'post', immediate: true })
  onMounted(() => {
    observer = new ResizeObserver(measure)
    // Initial post-render measurement may precede observer creation.
    observed = undefined
    measure()
  })
  onBeforeUnmount(() => observer?.disconnect())
  return { canPan, getOffset, setOffset }
}
