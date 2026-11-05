import type { HistoireRect } from '@histoire/protocol'
import type { BoxSize } from './design-element.js'

/** How the canvas view compares the variant with its design. */
export type CanvasMode = 'side-by-side' | 'overlay' | 'split'

/** Canvas modes in toggle order. */
export const CANVAS_MODES: readonly CanvasMode[] = ['side-by-side', 'overlay', 'split']

/** Design box laid over the variant frame, in canvas units. */
export interface OverlayPlacement {
  /** Left edge in canvas units. */
  x: number
  /** Top edge in canvas units. */
  y: number
  /** Width in canvas units. */
  width: number
  /** Height in canvas units. */
  height: number
  /** Split divider position as a ratio (0–1) of the design width; the design shows right of it. */
  split: number
}

/** Smallest design box edge in canvas units, so the grips stay reachable. */
const MIN_SIZE = 24

/**
 * Clamps a number into a range.
 * @param value Number.
 * @param min Lower bound.
 * @param max Upper bound.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Initial overlay: top-left on the frame box, scaled down to the frame width when wider.
 * @param frame Frame box in canvas space (label excluded).
 * @param design Design box size.
 */
export function defaultPlacement(frame: HistoireRect, design: BoxSize): OverlayPlacement {
  const scale = Math.min(1, frame.width / design.width)
  return { x: frame.x, y: frame.y, width: design.width * scale, height: design.height * scale, split: 0.5 }
}

/**
 * Moves the design box.
 * @param placement Current placement.
 * @param dx Horizontal delta in canvas units.
 * @param dy Vertical delta in canvas units.
 */
export function movePlacement(placement: OverlayPlacement, dx: number, dy: number): OverlayPlacement {
  return { ...placement, x: placement.x + dx, y: placement.y + dy }
}

/**
 * Resizes the design box from its bottom-right corner.
 * @param placement Current placement.
 * @param dx Horizontal delta in canvas units.
 * @param dy Vertical delta in canvas units.
 * @param keepAspect Keep the width/height ratio; the larger relative change drives both edges.
 */
export function resizePlacement(placement: OverlayPlacement, dx: number, dy: number, keepAspect: boolean): OverlayPlacement {
  if (!keepAspect) {
    return { ...placement, width: Math.max(MIN_SIZE, placement.width + dx), height: Math.max(MIN_SIZE, placement.height + dy) }
  }
  const widthScale = (placement.width + dx) / placement.width
  const heightScale = (placement.height + dy) / placement.height
  const scale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale
  // The shorter edge hits the minimum first; the other follows the ratio.
  const bounded = Math.max(MIN_SIZE / Math.min(placement.width, placement.height), scale)
  return { ...placement, width: placement.width * bounded, height: placement.height * bounded }
}

/**
 * Moves the split divider to a canvas x position, clamped to the design box.
 * @param placement Current placement.
 * @param canvasX Divider position in canvas units.
 */
export function setSplit(placement: OverlayPlacement, canvasX: number): OverlayPlacement {
  return { ...placement, split: clamp((canvasX - placement.x) / placement.width, 0, 1) }
}

/**
 * Union of the variant column and the design box, framed by Fit.
 * @param column Variant column box (label included).
 * @param placement Design box.
 */
export function overlayBounds(column: HistoireRect, placement: OverlayPlacement): HistoireRect {
  const x = Math.min(column.x, placement.x)
  const y = Math.min(column.y, placement.y)
  const right = Math.max(column.x + column.width, placement.x + placement.width)
  const bottom = Math.max(column.y + column.height, placement.y + placement.height)
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Stored mode, or side by side for anything unknown (preferences are user storage).
 * @param value Stored value.
 */
export function parseMode(value: unknown): CanvasMode {
  return CANVAS_MODES.includes(value as CanvasMode) ? value as CanvasMode : 'side-by-side'
}

/**
 * Stored placement, or `undefined` when it is not a usable box.
 * @param value Stored value.
 */
export function parsePlacement(value: unknown): OverlayPlacement | undefined {
  if (!value || typeof value !== 'object') return
  const { x, y, width, height, split } = value as Record<string, unknown>
  const numbers = [x, y, width, height, split]
  if (!numbers.every(number => typeof number === 'number' && Number.isFinite(number))) return
  if ((width as number) <= 0 || (height as number) <= 0) return
  return { x: x as number, y: y as number, width: width as number, height: height as number, split: clamp(split as number, 0, 1) }
}
