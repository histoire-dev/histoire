import type { HistoireControlsRect } from '@histoire/shared'

/** Maps sandbox coordinates into the host and rejects anchors outside visible bounds. */
export function getControlsOverlayAnchor(anchor: HistoireControlsRect, frame: HistoireControlsRect, bounds: HistoireControlsRect[]): HistoireControlsRect | null {
  const result = { ...anchor, x: frame.x + anchor.x, y: frame.y + anchor.y }
  if (![result.x, result.y, result.width, result.height].every(Number.isFinite)
    || result.width <= 0 || result.height <= 0) {
    return null
  }
  return bounds.every(bound => result.x + result.width > bound.x && result.x < bound.x + bound.width
    && result.y + result.height > bound.y && result.y < bound.y + bound.height)
    ? result
    : null
}
