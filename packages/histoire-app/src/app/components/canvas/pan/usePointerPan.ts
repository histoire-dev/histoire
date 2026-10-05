import type { CanvasPoint } from './usePanZoom.js'
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/** Store-independent pointer panning state. */
export interface PointerPanOptions {
  /** Reads the selected toolbar tool. */
  getTool: () => string
  /** Reads temporary Space pan state. */
  getSpace: () => boolean
  /** Reads the current client-pixel translation. */
  getOffset: () => CanvasPoint
  /** Persists a new client-pixel translation. */
  setOffset: (offset: CanvasPoint) => void
  /** Reports gesture start and end for iframe pointer suppression. */
  onActive?: (active: boolean) => void
}

/** Starts panning only for middle mouse or primary mouse with a pan intent. */
export function isPanGesture(button: number, tool: string, space: boolean): boolean {
  return button === 1 || (button === 0 && (tool === 'pan' || space))
}

/** Captures one pointer and applies identical deltas for all pan gestures. */
export function usePointerPan(options: PointerPanOptions) {
  const isPanning = ref(false)
  let pointerId: number | null = null
  let previous: CanvasPoint = { x: 0, y: 0 }
  let captureTarget: Element | null = null

  /** Clears active state and releases capture after ending a gesture. */
  function release() {
    if (pointerId !== null && captureTarget?.hasPointerCapture?.(pointerId)) {
      captureTarget.releasePointerCapture(pointerId)
    }
    pointerId = null
    captureTarget = null
    if (isPanning.value) {
      isPanning.value = false
      options.onActive?.(false)
    }
  }

  /** Begins an accepted pan and prevents native middle-click autoscroll. */
  function onPointerDown(event: PointerEvent): boolean {
    if (pointerId !== null || !isPanGesture(event.button, options.getTool(), options.getSpace())) return false
    event.preventDefault()
    pointerId = event.pointerId
    previous = { x: event.clientX, y: event.clientY }
    captureTarget = event.currentTarget as Element | null
    // Same-origin iframe events are relayed into parent canvas. Browser may
    // keep capture scoped to originating document; move/up relay still works.
    try {
      captureTarget?.setPointerCapture?.(event.pointerId)
    }
    catch { captureTarget = null }
    isPanning.value = true
    options.onActive?.(true)
    return true
  }

  /** Translates in client pixels, so pan speed never changes with zoom. */
  function onPointerMove(event: PointerEvent): boolean {
    if (pointerId !== event.pointerId) return false
    event.preventDefault()
    const offset = options.getOffset()
    options.setOffset({ x: offset.x + event.clientX - previous.x, y: offset.y + event.clientY - previous.y })
    previous = { x: event.clientX, y: event.clientY }
    return true
  }

  /** Ends only the captured pointer's gesture. */
  function onPointerUp(event: PointerEvent): boolean {
    if (pointerId !== event.pointerId) return false
    release()
    return true
  }

  if (getCurrentInstance()) onBeforeUnmount(release)
  return { isPanning, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, release }
}
