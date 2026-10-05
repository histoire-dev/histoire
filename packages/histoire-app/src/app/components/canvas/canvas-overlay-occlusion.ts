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

/** Return true when any canvas surface obscures fixed overlay information. */
export function canvasOverlayIsOccluded(overlay: CanvasOverlayRect, surfaces: Iterable<CanvasOverlayRect>): boolean {
  for (const surface of surfaces) {
    if (canvasRectsOverlap(overlay, surface)) return true
  }
  return false
}
