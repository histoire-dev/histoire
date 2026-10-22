import type { MeasureSegment } from './measure-geometry.js'
import { isVerticalSegment } from './measure-geometry.js'

/** Client-space point. */
interface LabelPoint {
  /** Left coordinate. */
  x: number
  /** Top coordinate. */
  y: number
}

/** Label waiting for a spot, with candidate top-left corners in preference order. */
export interface LabelRequest {
  /** Stable render key. */
  id: string
  /** Estimated label width. */
  width: number
  /** Estimated label height. */
  height: number
  /** Allowed top-left corners, best first. */
  candidates: readonly LabelPoint[]
}

/** Measure label text and highlight, placed at its chosen top-left corner. */
export interface MeasureLabel extends LabelPoint {
  /** Render key. */
  id: string
  /** Label text. */
  text: string
  /** Belongs to a run of equal gaps. */
  equal?: boolean
}

// Distance between a label and its guide, and the minimum room kept between two labels.
const OFFSET = 5
const SPACING = 2
// Monospace 10px labels with 3px/5px padding; estimates avoid a layout pass before placement.
const CHAR_WIDTH = 6.2
const LABEL_HEIGHT = 18
// Each guide tries its middle first, then slides this many label-steps along both ways.
const SLIDES = 3

/** Estimated size of a measure label for `text`. */
function labelSize(text: string): { width: number, height: number } {
  return { width: Math.ceil(text.length * CHAR_WIDTH) + 10, height: LABEL_HEIGHT }
}

/** Sub-pixel distances keep one decimal; whole pixels stay integers. */
function formatDistance(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** Slide offsets along a guide: 0, +1, -1, +2, -2, ... steps. */
function slides(step: number): number[] {
  const offsets = [0]
  for (let index = 1; index <= SLIDES; index++) offsets.push(index * step, -index * step)
  return offsets
}

/** Spots beside a vertical guide (right, then left) or above/below a horizontal one, sliding away from its middle. */
export function segmentLabelCandidates(segment: Pick<MeasureSegment, 'x1' | 'y1' | 'x2' | 'y2'>, width: number, height: number): LabelPoint[] {
  const middleX = (segment.x1 + segment.x2) / 2
  const middleY = (segment.y1 + segment.y2) / 2
  if (isVerticalSegment(segment)) {
    return slides(height + SPACING).flatMap(offset => [
      { x: middleX + OFFSET, y: middleY - height / 2 + offset },
      { x: middleX - OFFSET - width, y: middleY - height / 2 + offset },
    ])
  }
  return slides(width + SPACING).flatMap(offset => [
    { x: middleX - width / 2 + offset, y: middleY - OFFSET - height },
    { x: middleX - width / 2 + offset, y: middleY + OFFSET },
  ])
}

/** Spots for a size label: above the box, below it, then aligned to its corners. */
export function boxLabelCandidates(box: { left: number, top: number, width: number, height: number }, width: number, height: number): LabelPoint[] {
  const centerX = box.left + box.width / 2 - width / 2
  const above = box.top - OFFSET - height
  const below = box.top + box.height + OFFSET
  const right = box.left + box.width - width
  return [
    { x: centerX, y: above },
    { x: centerX, y: below },
    { x: box.left, y: above },
    { x: right, y: above },
    { x: box.left, y: below },
    { x: right, y: below },
  ]
}

/** Whether two placed labels come closer than the minimum spacing. */
function collides(a: LabelRequest & LabelPoint, b: LabelRequest & LabelPoint): boolean {
  return a.x < b.x + b.width + SPACING && b.x < a.x + a.width + SPACING
    && a.y < b.y + b.height + SPACING && b.y < a.y + a.height + SPACING
}

/** Greedy placement in request order: each label takes its first free spot, or is dropped when none is free. */
export function placeLabels<T extends LabelRequest>(requests: readonly T[]): (T & LabelPoint)[] {
  const placed: (T & LabelPoint)[] = []
  for (const request of requests) {
    for (const candidate of request.candidates) {
      const label = { ...request, ...candidate }
      if (placed.some(other => collides(label, other))) continue
      placed.push(label)
      break
    }
  }
  return placed
}

/** Size labels first, then distance labels, each moved to a free spot or dropped so none overlap. */
export function measureLabels(
  boxes: readonly { id: string, box: { left: number, top: number, width: number, height: number }, rect: { width: number, height: number }, locked: boolean }[],
  segments: readonly MeasureSegment[],
): MeasureLabel[] {
  const requests: (LabelRequest & Omit<MeasureLabel, 'x' | 'y'>)[] = [
    ...boxes.map((item) => {
      const text = `${Math.round(item.rect.width)} × ${Math.round(item.rect.height)}${item.locked ? ' Locked' : ''}`
      const size = labelSize(text)
      return { id: `size-${item.id}`, text, ...size, candidates: boxLabelCandidates(item.box, size.width, size.height) }
    }),
    ...segments.map((segment) => {
      const text = formatDistance(segment.value)
      const size = labelSize(text)
      return { id: segment.id, text, equal: segment.equal, ...size, candidates: segmentLabelCandidates(segment, size.width, size.height) }
    }),
  ]
  return placeLabels(requests).map(({ id, text, equal, x, y }) => ({ id, text, equal, x, y }))
}
