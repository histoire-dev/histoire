import type { HistoireElementRect } from '@histoire/shared'

/** Edge-only rectangle in frame CSS pixels. */
export type MeasureBox = Pick<HistoireElementRect, 'top' | 'right' | 'bottom' | 'left'>

/** One distance line in frame CSS pixels, labelled with its length. */
export interface MeasureSegment {
  /** Stable render key. */
  id: string
  /** Start horizontal coordinate. */
  x1: number
  /** Start vertical coordinate. */
  y1: number
  /** End horizontal coordinate. */
  x2: number
  /** End vertical coordinate. */
  y2: number
  /** Measured distance. */
  value: number
  /** Gap belongs to a run of equal repeated gaps. */
  equal?: boolean
}

/** Vertical when both ends share x; zero-length segments count as horizontal. */
export function isVerticalSegment(segment: Pick<MeasureSegment, 'x1' | 'y1' | 'x2' | 'y2'>): boolean {
  return segment.x1 === segment.x2 && segment.y1 !== segment.y2
}

// Sub-pixel layout noise must not split equal gaps or detect fake overlaps.
const EPSILON = 0.5

/** Middle of the shared span of two intervals, or middle of the first when they don't overlap. */
function sharedMiddle(start1: number, end1: number, start2: number, end2: number): number {
  const start = Math.max(start1, start2)
  const end = Math.min(end1, end2)
  return end >= start ? (start + end) / 2 : (start1 + end1) / 2
}

/** Whether `inner` lies fully inside `outer`. */
function contains(outer: MeasureBox, inner: MeasureBox): boolean {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom
}

/** Four distances from inner edges to outer edges; flush and overflowing sides are dropped. */
export function insetGuides(inner: MeasureBox, outer: MeasureBox): MeasureSegment[] {
  const x = (inner.left + inner.right) / 2
  const y = (inner.top + inner.bottom) / 2
  return [
    { id: 'top', x1: x, y1: outer.top, x2: x, y2: inner.top, value: inner.top - outer.top },
    { id: 'right', x1: inner.right, y1: y, x2: outer.right, y2: y, value: outer.right - inner.right },
    { id: 'bottom', x1: x, y1: inner.bottom, x2: x, y2: outer.bottom, value: outer.bottom - inner.bottom },
    { id: 'left', x1: outer.left, y1: y, x2: inner.left, y2: y, value: inner.left - outer.left },
  ].filter(segment => segment.value > EPSILON)
}

/** Distance between two elements: gaps when separated, inset when nested, edge deltas when overlapping. */
export function rectDistances(a: MeasureBox, b: MeasureBox): MeasureSegment[] {
  if (contains(b, a)) return insetGuides(a, b)
  if (contains(a, b)) return insetGuides(b, a)
  const segments: MeasureSegment[] = []
  const y = sharedMiddle(a.top, a.bottom, b.top, b.bottom)
  const x = sharedMiddle(a.left, a.right, b.left, b.right)
  // Sub-pixel overlaps from fractional layouts still count as touching neighbours.
  const rightOfA = b.left >= a.right - EPSILON
  const leftOfA = a.left >= b.right - EPSILON
  const belowA = b.top >= a.bottom - EPSILON
  const aboveA = a.top >= b.bottom - EPSILON
  const separatedX = rightOfA || leftOfA
  const separatedY = belowA || aboveA
  if (rightOfA) segments.push({ id: 'gap-x', x1: a.right, y1: y, x2: b.left, y2: y, value: Math.max(0, b.left - a.right) })
  else if (leftOfA) segments.push({ id: 'gap-x', x1: b.right, y1: y, x2: a.left, y2: y, value: Math.max(0, a.left - b.right) })
  if (belowA) segments.push({ id: 'gap-y', x1: x, y1: a.bottom, x2: x, y2: b.top, value: Math.max(0, b.top - a.bottom) })
  else if (aboveA) segments.push({ id: 'gap-y', x1: x, y1: b.bottom, x2: x, y2: a.top, value: Math.max(0, a.top - b.bottom) })
  if (separatedX || separatedY) return segments
  // Intersecting boxes: compare matching edges, drawn through the intersection middle.
  const edges: MeasureSegment[] = [
    { id: 'top', x1: x, y1: Math.min(a.top, b.top), x2: x, y2: Math.max(a.top, b.top), value: Math.abs(a.top - b.top) },
    { id: 'right', x1: Math.min(a.right, b.right), y1: y, x2: Math.max(a.right, b.right), y2: y, value: Math.abs(a.right - b.right) },
    { id: 'bottom', x1: x, y1: Math.min(a.bottom, b.bottom), x2: x, y2: Math.max(a.bottom, b.bottom), value: Math.abs(a.bottom - b.bottom) },
    { id: 'left', x1: Math.min(a.left, b.left), y1: y, x2: Math.max(a.left, b.left), y2: y, value: Math.abs(a.left - b.left) },
  ]
  return edges.filter(segment => segment.value > 0)
}

/** Length shared by two intervals (negative when apart). */
function overlap(start1: number, end1: number, start2: number, end2: number): number {
  return Math.min(end1, end2) - Math.max(start1, start2)
}

/** Boxes cover a common area, as an out-of-flow badge or backdrop does. */
function intersects(a: MeasureBox, b: MeasureBox): boolean {
  return overlap(a.left, a.right, b.left, b.right) > EPSILON && overlap(a.top, a.bottom, b.top, b.bottom) > EPSILON
}

/**
 * Contiguous line of siblings through the measured box along one axis.
 * Walks outward from the measured box, each step taking the nearest box that follows without overlap
 * and still shares the band common to the whole run, so badges, backdrops and other rows are skipped.
 */
function axisRun(boxes: readonly MeasureBox[], index: number, horizontal: boolean): MeasureBox[] {
  const start = horizontal ? 'left' : 'top'
  const end = horizontal ? 'right' : 'bottom'
  const crossStart = horizontal ? 'top' : 'left'
  const crossEnd = horizontal ? 'bottom' : 'right'
  const measured = boxes[index]
  const candidates = boxes.filter(item => item !== measured && !intersects(item, measured))
  const run = [measured]
  let band = { start: measured[crossStart], end: measured[crossEnd] }
  /** Nearest box continuing the run past `current`, forward or backward. */
  const step = (current: MeasureBox, forward: boolean) => {
    let best: MeasureBox | undefined
    for (const item of candidates) {
      if (run.includes(item) || overlap(band.start, band.end, item[crossStart], item[crossEnd]) <= EPSILON) continue
      const follows = forward ? item[start] >= current[end] - EPSILON : item[end] <= current[start] + EPSILON
      if (follows && (!best || (forward ? item[start] < best[start] : item[end] > best[end]))) best = item
    }
    return best
  }
  for (const forward of [true, false]) {
    let current = measured
    for (let next = step(current, forward); next; next = step(current, forward)) {
      run.push(next)
      band = { start: Math.max(band.start, next[crossStart]), end: Math.min(band.end, next[crossEnd]) }
      current = next
    }
  }
  return run.sort((first, second) => first[start] - second[start])
}

/** Labelled gaps between consecutive boxes of a run; flush neighbours get no label. */
function runGaps(run: readonly MeasureBox[], horizontal: boolean): MeasureSegment[] {
  const start = horizontal ? 'left' : 'top'
  const end = horizontal ? 'right' : 'bottom'
  const crossStart = horizontal ? 'top' : 'left'
  const crossEnd = horizontal ? 'bottom' : 'right'
  const gaps: MeasureSegment[] = []
  for (let index = 1; index < run.length; index++) {
    const previous = run[index - 1]
    const next = run[index]
    const value = Math.max(0, next[start] - previous[end])
    if (value <= EPSILON) continue
    const cross = sharedMiddle(previous[crossStart], previous[crossEnd], next[crossStart], next[crossEnd])
    gaps.push(horizontal
      ? { id: `gap-${index}`, x1: previous[end], y1: cross, x2: next[start], y2: cross, value }
      : { id: `gap-${index}`, x1: cross, y1: previous[end], x2: cross, y2: next[start], value })
  }
  return gaps
}

/** Gaps along the row or column through the measured sibling (longest run wins, row on ties); equal runs are flagged. */
export function repeatedGaps(siblings: readonly MeasureBox[], index: number): MeasureSegment[] {
  if (siblings.length < 2 || !siblings[index]) return []
  const row = axisRun(siblings, index, true)
  const column = axisRun(siblings, index, false)
  const gaps = column.length > row.length ? runGaps(column, false) : runGaps(row, true)
  const equal = gaps.length >= 2 && gaps.every(gap => Math.abs(gap.value - gaps[0].value) <= EPSILON)
  return equal ? gaps.map(gap => ({ ...gap, equal: true })) : gaps
}
