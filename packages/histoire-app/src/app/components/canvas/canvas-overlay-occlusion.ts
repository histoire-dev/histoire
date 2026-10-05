/** Screen-space rectangle needed to detect visual overlap. */
export interface CanvasOverlayRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Return true only when two canvas surfaces share visible screen area. */
export function canvasRectsOverlap(first: CanvasOverlayRect, second: CanvasOverlayRect): boolean {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
}
