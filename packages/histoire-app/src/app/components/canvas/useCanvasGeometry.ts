import type { CanvasContentInsets } from '../../stores/canvas.js'
import type { CanvasSize } from './pan/usePanZoom.js'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/** Fixed chrome is measured separately from transformed frame geometry. */
interface CanvasGeometryOptions {
  /** Owning viewport, possibly mounted after setup. */
  viewport: () => HTMLElement | undefined
  /** Floating toolbar host, including custom toolbar slot. */
  toolbar: () => HTMLElement | undefined
  /** Conditional story heading, including custom header slot. */
  header: () => HTMLElement | undefined
  /** Status or persistent Pan hint root. */
  footer: () => HTMLElement | undefined
  /** Temporary hints retain last stable footer reservation. */
  temporaryPan: () => boolean
  /** Publish local client geometry to arrangement owner. */
  onMeasure: (size: CanvasSize, insets: CanvasContentInsets) => void
}

/** Relative header bounds let consumers react when fixed information moves. */
interface CanvasHeaderBounds {
  top: number
  bottom: number
}

/** Observe viewport and overlay boxes without including scaled preview documents. */
export function useCanvasGeometry(options: CanvasGeometryOptions) {
  const insets = shallowRef({ topInset: 0, bottomInset: 0 })
  const headerBounds = shallowRef<CanvasHeaderBounds>()
  const elements = [options.viewport, options.toolbar, options.header, options.footer]
  let observer: ResizeObserver | undefined
  const observed = new Set<HTMLElement>()

  /** Ignore empty slot hosts and absent or hidden chrome. */
  function visibleRect(element?: HTMLElement) {
    const rect = element?.getBoundingClientRect()
    return rect && rect.width > 0 && rect.height > 0 ? rect : undefined
  }

  /** Convert fixed DOM rectangles into viewport-relative, unscaled reservations. */
  function measure() {
    const viewport = options.viewport()?.getBoundingClientRect()
    if (!viewport) return
    const toolbar = visibleRect(options.toolbar())
    const header = visibleRect(options.header())
    const footer = visibleRect(options.footer())
    const topInset = Math.max(0, (toolbar?.bottom ?? viewport.top) - viewport.top, (header?.bottom ?? viewport.top) - viewport.top)
    // Space/middle mouse only change hint presentation; they must never recenter Fit.
    const bottomInset = options.temporaryPan() ? insets.value.bottomInset : Math.max(0, viewport.bottom - (footer?.top ?? viewport.bottom))
    if (insets.value.topInset !== topInset || insets.value.bottomInset !== bottomInset) insets.value = { topInset, bottomInset }
    const nextHeaderBounds = header ? { top: header.top - viewport.top, bottom: header.bottom - viewport.top } : undefined
    if (headerBounds.value?.top !== nextHeaderBounds?.top || headerBounds.value?.bottom !== nextHeaderBounds?.bottom) headerBounds.value = nextHeaderBounds
    options.onMeasure({ width: viewport.width, height: viewport.height }, insets.value)
  }

  /** Rebind conditional headers and component roots while retaining one observer owner. */
  function observe() {
    if (!observer) return
    const current = new Set(elements.map(read => read()).filter((element): element is HTMLElement => Boolean(element)))
    for (const element of observed) {
      if (!current.has(element)) {
        observer.unobserve(element)
        observed.delete(element)
      }
    }
    for (const element of current) {
      if (!observed.has(element)) {
        observer.observe(element)
        observed.add(element)
      }
    }
    measure()
  }

  watch(elements, observe, { flush: 'post' })
  onMounted(() => {
    observer = new ResizeObserver(measure)
    observe()
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    observed.clear()
  })
  return { insets, headerBounds, measure }
}
