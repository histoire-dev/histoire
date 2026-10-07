import type { CanvasPoint, CanvasSize } from './pan/usePanZoom.js'
import { clampZoom } from './pan/usePanZoom.js'

/** Native scroll adapter receives zoom before the rendered frame changes size. */
export type SingleZoomListener = (zoom: number, point: CanvasPoint | undefined, fit: boolean) => void

/** Shrink oversized logical viewports without enlarging smaller documents. */
export function fitSingleViewport(area: CanvasSize, size: CanvasSize): number {
  return clampZoom(Math.min(1, area.width / Math.max(1, size.width), area.height / Math.max(1, size.height)))
}
