import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import type { CanvasFrameLayout } from './frame-layout.js'
import type { usePointerPan } from './pan/usePointerPan.js'

/** Frame pointer coordinates emitted to the comment placement flow. */
export interface CanvasFramePointerTarget {
  /** Collected story identifier. */
  storyId: string
  /** Collected variant identifier. */
  variantId: string
  /** Stable canvas frame key. */
  frameKey: string
  /** Preview document CSS coordinates. */
  point: { x: number, y: number }
  /** Browser client coordinates. */
  clientPoint: { x: number, y: number }
}

/** Build canvas handlers outside the main viewport component. */
export function createCanvasViewportEvents(options: {
  /** Current canvas element. */
  getViewport: () => HTMLElement | undefined
  /** Current frame registry. */
  frames: CanvasFrames
  /** Camera and zoom owner. */
  canvas: CanvasStore
  /** Shared pointer gesture owner. */
  pointer: ReturnType<typeof usePointerPan>
  /** Current selection. */
  getSelectedFrame: () => CanvasFrameLayout | undefined
  /** Current comment placement mode. */
  getCommentMode: () => boolean
  /** Whether a camera pan gesture owns the pointer. */
  isPanning: () => boolean
  /** Open frame actions from canvas background. */
  openMenu: (event: MouseEvent | KeyboardEvent, target: { storyId: string, variantId: string, frameKey: string }) => void
  /** Publish exact frame pointer coordinates. */
  emitFramePointer: (target: CanvasFramePointerTarget) => void
}) {
  /** Wheel pans normally; modifier zoom stays anchored at local cursor position. */
  function onWheel(event: WheelEvent): void {
    const viewport = options.getViewport()
    if (!viewport) return
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect()
      options.canvas.setZoom(options.canvas.effectiveZoom * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    else {
      options.canvas.panBy({ x: -event.deltaX, y: -event.deltaY })
    }
  }

  /** Blank canvas uses selected frame actions; child surfaces keep their menus. */
  function openCanvasMenu(event: MouseEvent | KeyboardEvent): void {
    if (event.target !== options.getViewport()) return
    const frame = options.getSelectedFrame()
    if (frame) options.openMenu(event, { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id })
  }

  /** Give canvas background focus without stealing interactive control focus. */
  function pointerDown(event: PointerEvent): void {
    const target = event.target as Element | null
    if (!target?.closest('button, a[href], input, textarea, select, summary, [contenteditable], [role="button"]')) options.getViewport()?.focus({ preventScroll: true })
    options.pointer.onPointerDown(event)
  }

  /** Comment placement captures exact registered document coordinates. */
  function framePointer(event: PointerEvent): void {
    if (!options.getCommentMode() || event.button !== 0 || options.isPanning() || (event.target as Element)?.closest('.histoire-canvas-toolbar, button, input, textarea, select, [contenteditable]')) return
    const clientPoint = { x: event.clientX, y: event.clientY }
    for (const frame of options.frames.frames.values()) {
      const point = options.frames.clientToFrame(frame.id, clientPoint)
      if (!point || point.x < 0 || point.y < 0 || point.x > frame.rect.width || point.y > frame.rect.height) continue
      event.preventDefault()
      event.stopPropagation()
      options.emitFramePointer({ storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id, point, clientPoint })
      return
    }
  }

  return { onWheel, openCanvasMenu, pointerDown, framePointer }
}
