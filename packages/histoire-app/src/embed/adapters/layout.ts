import type { HistoireRect, HistoireViewport } from '@histoire/protocol'
import { intersectRuntimeRects } from './geometry.js'

/** Rectangles copied from DOM, so no DOM-bearing values cross wire. */
function rectangle(value: DOMRect): HistoireRect {
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

/** Measure content against every relevant scroll clip inside story document. */
function visibleRectangle(element: HTMLElement, content: HistoireRect): HistoireRect | null {
  let visible = intersectRuntimeRects(content, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
  for (let parent = element.parentElement; parent && visible; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const x = /auto|scroll|hidden|clip/.test(style.overflowX)
    const y = /auto|scroll|hidden|clip/.test(style.overflowY)
    if (x || y) {
      const rect = rectangle(parent.getBoundingClientRect())
      visible = intersectRuntimeRects(visible, { x: x ? rect.x : visible.x, y: y ? rect.y : visible.y, width: x ? rect.width : visible.width, height: y ? rect.height : visible.height })
    }
  }
  return visible
}

/** Actual ready content roots, shared by single/grid engine; owned by one document. */
export function observeRuntimeLayout(options: {
  /** Current structured story owner. */
  getStoryId: () => string | undefined
  /** Readiness comes from render acknowledgment, never DOM existence alone. */
  isReady: (variantId: string) => boolean
  /** Full replacement publication includes disappearing clipped cells. */
  publish: (viewports: HistoireViewport[]) => void
}) {
  let closed = false
  let scheduled = 0
  let previous = ''
  const observed = new Set<HTMLElement>()
  /** Coalesce scroll/mutation/resize without observer feedback loops. */
  function refresh() {
    if (!closed && !scheduled) scheduled = requestAnimationFrame(measure)
  }
  const resize = new ResizeObserver(refresh)
  /** Each root appears once, with exact variant attribute instead of parsed IDs. */
  function measure() {
    scheduled = 0
    if (closed) return
    const elements = new Set(document.querySelectorAll<HTMLElement>('[data-histoire-runtime-content]'))
    for (const old of observed) {
      if (!elements.has(old)) {
        resize.unobserve(old)
        observed.delete(old)
      }
    }
    const viewports: HistoireViewport[] = []
    const storyId = options.getStoryId()
    for (const element of elements) {
      if (!observed.has(element)) {
        observed.add(element)
        resize.observe(element)
      }
      const variantId = element.getAttribute('data-histoire-variant-id')
      if (!storyId || !variantId || !options.isReady(variantId)) continue
      const rect = rectangle(element.getBoundingClientRect())
      const visibleRect = visibleRectangle(element, rect)
      if (visibleRect) viewports.push({ ...rect, target: { storyId, variantId }, scale: element.offsetWidth ? rect.width / element.offsetWidth : 1, visibleRect })
    }
    const serialized = JSON.stringify(viewports)
    if (previous !== serialized) {
      previous = serialized
      options.publish(viewports)
    }
  }
  const mutation = new MutationObserver(refresh)
  mutation.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
  resize.observe(document.documentElement)
  document.addEventListener('scroll', refresh, true)
  window.addEventListener('resize', refresh)
  refresh()
  return {
    refresh,
    /** Remove every observer/listener before document owner is released. */
    close() {
      if (closed) return
      closed = true
      cancelAnimationFrame(scheduled)
      mutation.disconnect()
      resize.disconnect()
      observed.clear()
      document.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    },
  }
}
