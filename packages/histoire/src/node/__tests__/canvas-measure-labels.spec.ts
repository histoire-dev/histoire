import { describe, expect, it } from 'vitest'
import { boxLabelCandidates, placeLabels, segmentLabelCandidates } from '../../../../histoire-app/src/app/components/canvas/measure-labels.js'

/** Whether two placed labels cover a common area. */
function overlaps(a: { x: number, y: number, width: number, height: number }, b: { x: number, y: number, width: number, height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('measure label placement', () => {
  it('keeps the preferred spot when free and moves later labels off taken spots', () => {
    const placed = placeLabels([
      { id: 'first', width: 20, height: 10, candidates: [{ x: 0, y: 0 }] },
      { id: 'second', width: 20, height: 10, candidates: [{ x: 10, y: 5 }, { x: 30, y: 0 }] },
    ])
    expect(placed.map(label => [label.id, label.x, label.y])).toEqual([['first', 0, 0], ['second', 30, 0]])
  })

  it('drops a label when every candidate collides', () => {
    const placed = placeLabels([
      { id: 'first', width: 20, height: 10, candidates: [{ x: 0, y: 0 }] },
      { id: 'second', width: 20, height: 10, candidates: [{ x: 5, y: 0 }] },
    ])
    expect(placed.map(label => label.id)).toEqual(['first'])
  })

  it('separates labels of stacked guides sharing one vertical line', () => {
    // Size label above a box, then a parent guide and a gap guide meeting on the same line.
    const size = { width: 80, height: 18 }
    const value = { width: 22, height: 18 }
    const placed = placeLabels([
      { id: 'size', ...size, candidates: boxLabelCandidates({ left: 100, top: 100, width: 40, height: 48 }, size.width, size.height) },
      { id: 'parent', ...value, candidates: segmentLabelCandidates({ x1: 120, y1: 0, x2: 120, y2: 100 }, value.width, value.height) },
      { id: 'gap', ...value, candidates: segmentLabelCandidates({ x1: 120, y1: 84, x2: 120, y2: 100 }, value.width, value.height) },
    ])
    expect(placed).toHaveLength(3)
    for (const [index, label] of placed.entries()) {
      for (const other of placed.slice(index + 1)) expect(overlaps(label, other)).toBe(false)
    }
  })

  it('prefers beside a vertical guide and above a horizontal guide, centered on the middle', () => {
    expect(segmentLabelCandidates({ x1: 50, y1: 0, x2: 50, y2: 100 }, 20, 10)[0]).toEqual({ x: 55, y: 45 })
    expect(segmentLabelCandidates({ x1: 0, y1: 50, x2: 100, y2: 50 }, 20, 10)[0]).toEqual({ x: 40, y: 35 })
  })
})
