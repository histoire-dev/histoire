import { shallowRef } from 'vue'

/** Smallest directly resizable Single viewport dimension. */
export const SINGLE_RESIZE_MIN = 32

/** Largest viewport dimension accepted by direct resizing. */
export const SINGLE_RESIZE_MAX = 16384

/** Axes owned by one Single viewport resize grip. */
export type SingleResizeAxis = 'width' | 'height' | 'both'

/** Physical unscaled viewport dimensions. */
export interface SingleResizeSize {
  /** Logical CSS pixel width. */
  width: number
  /** Logical CSS pixel height. */
  height: number
}

/** Measured displayed geometry used to project pointer coordinates. */
export interface SingleResizeGeometry {
  /** Current displayed frame bounds. */
  frame: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>
  /** Native scrolling surface geometry. */
  surface: {
    /** Surface left in client coordinates. */
    left: number
    /** Surface top in client coordinates. */
    top: number
    /** Visible content width. */
    width: number
    /** Native horizontal scroll offset. */
    scrollLeft: number
    /** Native vertical scroll offset. */
    scrollTop: number
  }
  /** Frozen displayed scale converting logical pixels to client pixels. */
  zoom: number
}

/** Ports used by the framework-independent resize controller. */
export interface SingleResizeControllerOptions {
  /** Read current physical dimensions. */
  getSize: () => SingleResizeSize
  /** Measure frame and surface coordinates. */
  getGeometry: () => SingleResizeGeometry | undefined
  /** Freeze automatic geometry before first effective change. */
  onStart: () => void
  /** Publish one live draft. */
  onResize: (size: SingleResizeSize) => void
  /** Persist completed physical dimensions. */
  onCommit: (size: SingleResizeSize) => void
}

/** Clamp and round one logical viewport dimension. */
function clampDimension(value: number): number {
  return Math.min(SINGLE_RESIZE_MAX, Math.max(SINGLE_RESIZE_MIN, Math.round(value)))
}

/** Compare complete viewport dimensions without allocating a reactive proxy. */
function sameSize(first: SingleResizeSize, second: SingleResizeSize): boolean {
  return first.width === second.width && first.height === second.height
}

/** Own one pointer or keyboard resize without leaking listeners across teardown. */
export function createSingleResizeController(options: SingleResizeControllerOptions) {
  const active = shallowRef(false)
  let axis: SingleResizeAxis | null = null
  let pointerId: number | null = null
  let target: HTMLElement | null = null
  let origin = { x: 0, y: 0 }
  let edgeOffset = { x: 0, y: 0 }
  let draft: SingleResizeSize | null = null
  let started = false
  let closed = false

  /** Start fixed sizing only when input produces an effective dimension change. */
  function start(): void {
    if (started) return
    started = true
    options.onStart()
  }

  /** Publish one changed, bounded viewport draft. */
  function resize(next: SingleResizeSize): void {
    const bounded = { width: clampDimension(next.width), height: clampDimension(next.height) }
    const current = draft ?? options.getSize()
    if (sameSize(current, bounded)) return
    start()
    draft = bounded
    options.onResize(bounded)
  }

  /** Project a right-edge pointer into centered or overflowed frame width. */
  function pointerWidth(event: PointerEvent, geometry: SingleResizeGeometry): number {
    const right = event.clientX + edgeOffset.x - geometry.surface.left + geometry.surface.scrollLeft
    const displayed = right > geometry.surface.width ? right : right * 2 - geometry.surface.width
    return displayed / geometry.zoom
  }

  /** Project a bottom-edge pointer through native scroll and displayed zoom. */
  function pointerHeight(event: PointerEvent, geometry: SingleResizeGeometry): number {
    return (event.clientY + edgeOffset.y - geometry.surface.top + geometry.surface.scrollTop) / geometry.zoom
  }

  /** Begin primary pointer ownership for one grip. */
  function onPointerDown(nextAxis: SingleResizeAxis, event: PointerEvent): void {
    if (closed || pointerId !== null || event.button !== 0) return
    const geometry = options.getGeometry()
    if (!geometry) return
    event.preventDefault()
    event.stopPropagation()
    axis = nextAxis
    pointerId = event.pointerId
    target = event.currentTarget as HTMLElement | null
    origin = { x: event.clientX, y: event.clientY }
    edgeOffset = { x: geometry.frame.right - event.clientX, y: geometry.frame.bottom - event.clientY }
    target?.focus({ preventScroll: true })
    try {
      target?.setPointerCapture?.(event.pointerId)
    }
    catch { /* Document listeners still own completion when capture is unavailable. */ }
    active.value = true
  }

  /** Update only the axes owned by the captured pointer. */
  function onPointerMove(event: PointerEvent): void {
    if (closed || pointerId !== event.pointerId || !axis) return
    const ownsWidth = axis === 'width' || axis === 'both'
    const ownsHeight = axis === 'height' || axis === 'both'
    if ((!ownsWidth || event.clientX === origin.x) && (!ownsHeight || event.clientY === origin.y)) return
    const geometry = options.getGeometry()
    if (!geometry || geometry.zoom <= 0) return
    event.preventDefault()
    event.stopPropagation()
    const current = draft ?? options.getSize()
    resize({
      width: ownsWidth ? pointerWidth(event, geometry) : current.width,
      height: ownsHeight ? pointerHeight(event, geometry) : current.height,
    })
  }

  /** Release native pointer capture, optionally committing the final draft. */
  function release(commit = true): void {
    const id = pointerId
    const element = target
    const completed = draft
    pointerId = null
    target = null
    axis = null
    draft = null
    started = false
    active.value = false
    if (id !== null && element?.hasPointerCapture?.(id)) element.releasePointerCapture(id)
    if (commit && completed) options.onCommit(completed)
  }

  /** Complete only the currently captured pointer gesture. */
  function onPointerEnd(event: PointerEvent): void {
    if (pointerId === event.pointerId) release()
  }

  /** Resize one accessible separator and commit its result immediately. */
  function onKeyDown(nextAxis: Exclude<SingleResizeAxis, 'both'>, event: KeyboardEvent): void {
    if (closed || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const widthKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const heightKey = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if ((nextAxis === 'width' && heightKey) || (nextAxis === 'height' && widthKey)) return
    event.preventDefault()
    event.stopPropagation()
    const current = options.getSize()
    const step = event.shiftKey ? 32 : 8
    const value = event.key === 'Home'
      ? SINGLE_RESIZE_MIN
      : event.key === 'End'
        ? SINGLE_RESIZE_MAX
        : current[nextAxis] + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? step : -step)
    const next = { ...current, [nextAxis]: clampDimension(value) }
    if (sameSize(current, next)) return
    options.onStart()
    options.onResize(next)
    options.onCommit(next)
  }

  /** Retire ownership without persisting an unfinished gesture. */
  function close(): void {
    closed = true
    release(false)
  }

  return { active, close, onKeyDown, onPointerDown, onPointerEnd, onPointerMove, release }
}
