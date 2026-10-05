import type { HistoireRect, HistoireViewport } from './types/snapshot.js'

/** Positive intersection; fully clipped content has no published viewport. */
export function intersectRuntimeRects(left: HistoireRect, right: HistoireRect): HistoireRect | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const width = Math.min(left.x + left.width, right.x + right.width) - x
  const height = Math.min(left.y + left.height, right.y + right.height) - y
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/** Compose sandbox offsets/scales into source surface padding-box coordinates. */
export function mapRuntimeViewport(viewport: HistoireViewport, frame: HistoireRect, logical: { width: number, height: number }, clip: HistoireRect): HistoireViewport | null {
  const scaleX = frame.width / logical.width
  const scaleY = frame.height / logical.height
  /** Transform one rectangle through iframe rendered dimensions. */
  function map(rect: HistoireRect): HistoireRect {
    return { x: frame.x + rect.x * scaleX, y: frame.y + rect.y * scaleY, width: rect.width * scaleX, height: rect.height * scaleY }
  }
  const visibleRect = intersectRuntimeRects(map(viewport.visibleRect), clip)
  return visibleRect ? { ...map(viewport), target: viewport.target, scale: viewport.scale * scaleX, visibleRect } : null
}
