import type { PanelWidthBounds } from '../../stores/shell-widths.js'
import { shallowRef } from 'vue'
import { clampPanelWidth } from '../../stores/shell-widths.js'

/** One separator owns one pointer gesture and applies physical keyboard movement. */
export function createPanelResizeController(options: {
  /** Logical panel edge where the separator is rendered. */
  edge: 'start' | 'end'
  /** Current effective panel width. */
  getWidth: () => number
  /** Current provider-specific limits. */
  getBounds: () => PanelWidthBounds
  /** Persist an accepted user resize. */
  setWidth: (value: number) => void
  /** CSS writing direction of the rendered separator. */
  getDirection: () => 'ltr' | 'rtl'
}) {
  const active = shallowRef(false)
  let pointerId: number | null = null
  let target: HTMLElement | null = null
  let origin = 0
  let initialWidth = 0
  let closed = false
  /** Convert physical pointer/arrow movement to logical inline size. */
  function direction(): number {
    return (options.edge === 'end' ? 1 : -1) * (options.getDirection() === 'rtl' ? -1 : 1)
  }
  /** All inputs share one dynamic range, including a host resize mid-gesture. */
  function resize(value: number): void {
    options.setWidth(clampPanelWidth(value, options.getBounds(), options.getWidth()))
  }
  /** Clear ownership before releasing capture, which may synchronously emit loss. */
  function release(): void {
    const id = pointerId
    const element = target
    pointerId = null
    target = null
    active.value = false
    if (id !== null && element?.hasPointerCapture?.(id)) element.releasePointerCapture(id)
  }
  /** Begin primary-button drag and capture movement across embedded previews. */
  function onPointerDown(event: PointerEvent): void {
    if (closed || pointerId !== null || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pointerId = event.pointerId
    target = event.currentTarget as HTMLElement | null
    origin = event.clientX
    initialWidth = options.getWidth()
    target?.focus({ preventScroll: true })
    try {
      target?.setPointerCapture?.(event.pointerId)
    }
    catch { /* Native document listeners still finish unsupported capture. */ }
    active.value = true
  }
  /** Native document movement keeps a drag alive outside the small visible grip. */
  function onPointerMove(event: PointerEvent): void {
    if (closed || pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    resize(initialWidth + (event.clientX - origin) * direction())
  }
  /** Other pointer endings cannot interrupt the currently owned gesture. */
  function onPointerEnd(event: PointerEvent): void {
    if (pointerId === event.pointerId) release()
  }
  /** Physical arrows move the edge; Shift makes a larger step, Home/End reach limits. */
  function onKeyDown(event: KeyboardEvent): void {
    if (closed || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = options.getBounds()
    const step = event.shiftKey ? 32 : 8
    resize(event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : options.getWidth() + (event.key === 'ArrowRight' ? step : -step) * direction())
  }
  /** Retirement releases capture and rejects events after component teardown. */
  function close(): void {
    closed = true
    release()
  }
  return { active, onPointerDown, onPointerMove, onPointerEnd, onKeyDown, release, close }
}
