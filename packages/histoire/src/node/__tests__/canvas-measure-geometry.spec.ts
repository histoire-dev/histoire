import { describe, expect, it } from 'vitest'
import { insetGuides, rectDistances, repeatedGaps } from '../../../../histoire-app/src/app/components/canvas/measure-geometry.js'
import { box } from './utils/measurement.js'

/** Compact id/value pairs keep assertions about distances, not drawing. */
function values(segments: { id: string, value: number }[]) {
  return Object.fromEntries(segments.map(segment => [segment.id, segment.value]))
}

describe('measure geometry', () => {
  it('measures inset distances to container and drops flush or overflowing sides', () => {
    expect(values(insetGuides(box(-5, 20, 30, 40), box(0, 0, 100, 100)))).toEqual({ top: 20, right: 75, bottom: 40 })
    expect(insetGuides(box(0, 0, 100, 10), box(0, 0, 100, 10))).toEqual([])
  })

  it('measures horizontal gap through shared vertical span', () => {
    const segments = rectDistances(box(0, 0, 10, 20), box(30, 10, 10, 20))
    expect(segments).toEqual([{ id: 'gap-x', x1: 10, y1: 15, x2: 30, y2: 15, value: 20 }])
    expect(values(rectDistances(box(30, 10, 10, 20), box(0, 0, 10, 20)))).toEqual({ 'gap-x': 20 })
  })

  it('measures vertical gap and both gaps for diagonal elements', () => {
    expect(values(rectDistances(box(0, 0, 10, 10), box(0, 25, 10, 10)))).toEqual({ 'gap-y': 15 })
    expect(values(rectDistances(box(0, 0, 10, 10), box(20, 40, 10, 10)))).toEqual({ 'gap-x': 10, 'gap-y': 30 })
  })

  it('treats sub-pixel overlap between neighbours as touching', () => {
    expect(values(rectDistances(box(0, 0, 10, 10), box(9.8, 0, 10, 10)))).toEqual({ 'gap-x': 0 })
  })

  it('measures gap to parent when element sits outside it', () => {
    expect(values(rectDistances(box(0, 120, 10, 10), box(0, 0, 100, 100)))).toEqual({ 'gap-y': 20 })
  })

  it('measures inset when either element contains the other', () => {
    const outer = box(0, 0, 100, 100)
    const inner = box(10, 20, 30, 40)
    expect(values(rectDistances(inner, outer))).toEqual({ top: 20, right: 60, bottom: 40, left: 10 })
    expect(values(rectDistances(outer, inner))).toEqual({ top: 20, right: 60, bottom: 40, left: 10 })
  })

  it('measures edge deltas for partially overlapping elements', () => {
    expect(values(rectDistances(box(0, 0, 50, 50), box(20, 10, 50, 50)))).toEqual({ top: 10, right: 20, bottom: 10, left: 20 })
  })

  it('flags equal repeated gaps in a row regardless of order', () => {
    const gaps = repeatedGaps([box(40, 0, 10, 10), box(0, 0, 10, 10), box(20, 0, 10, 10)], 1)
    expect(gaps.map(gap => [gap.value, gap.equal])).toEqual([[10, true], [10, true]])
    expect(gaps[0]).toMatchObject({ x1: 10, x2: 20, y1: 5 })
  })

  it('measures column gaps and leaves uneven gaps unflagged', () => {
    const gaps = repeatedGaps([box(0, 0, 10, 10), box(0, 15, 10, 10), box(0, 40, 10, 10)], 0)
    expect(gaps.map(gap => [gap.value, gap.equal])).toEqual([[5, undefined], [15, undefined]])
  })

  it('tolerates sub-pixel differences between equal gaps', () => {
    expect(repeatedGaps([box(0, 0, 10, 10), box(20, 0, 10, 10), box(40.3, 0, 10, 10)], 0).every(gap => gap.equal)).toBe(true)
  })

  it('ignores out-of-flow siblings such as badges and backdrops', () => {
    const row = [box(0, 0, 10, 10), box(20, 0, 10, 10), box(40, 0, 10, 10)]
    const badge = box(27, -3, 6, 6)
    const backdrop = box(-5, -5, 60, 20)
    for (const siblings of [[...row, badge], [backdrop, ...row]]) {
      const index = siblings.indexOf(row[0])
      expect(repeatedGaps(siblings, index).map(gap => [gap.value, gap.equal])).toEqual([[10, true], [10, true]])
    }
  })

  it('measures the row of the element in a wrapped grid', () => {
    const grid = [box(0, 0, 10, 10), box(20, 0, 10, 10), box(40, 0, 10, 10), box(0, 15, 10, 10), box(20, 15, 10, 10), box(40, 15, 10, 10)]
    expect(repeatedGaps(grid, 4).map(gap => [gap.value, gap.y1])).toEqual([[10, 20], [10, 20]])
  })

  it('stops a run where siblings stop sharing a common band', () => {
    expect(values(repeatedGaps([box(0, 0, 10, 10), box(20, 5, 10, 10), box(40, 12, 10, 10)], 0))).toEqual({ 'gap-1': 10 })
  })

  it('skips single children and flush lists', () => {
    expect(repeatedGaps([box(0, 0, 10, 10)], 0)).toEqual([])
    expect(repeatedGaps([box(0, 0, 100, 10), box(0, 10, 100, 10), box(0, 20, 100, 10)], 1)).toEqual([])
  })
})
