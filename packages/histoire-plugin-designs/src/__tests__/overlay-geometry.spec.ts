import { describe, expect, it } from 'vitest'
import { defaultPlacement, movePlacement, overlayBounds, parseMode, parsePlacement, resizePlacement, setSplit } from '../workbench/canvas/overlay-geometry.js'

const frame = { x: 0, y: 32, width: 420, height: 720 }

describe('overlay geometry', () => {
  it('places the design on the frame, scaled down to the frame width but never upscaled', () => {
    expect(defaultPlacement(frame, { width: 840, height: 1600 })).toEqual({ x: 0, y: 32, width: 420, height: 800, split: 0.5 })
    expect(defaultPlacement(frame, { width: 200, height: 100 })).toEqual({ x: 0, y: 32, width: 200, height: 100, split: 0.5 })
  })

  it('moves the design box without changing its size', () => {
    const placement = { x: 0, y: 32, width: 420, height: 800, split: 0.5 }
    expect(movePlacement(placement, 10, -5)).toEqual({ ...placement, x: 10, y: 27 })
  })

  it('resizes from the bottom-right corner, keeping the aspect ratio on request', () => {
    const placement = { x: 0, y: 0, width: 400, height: 200, split: 0.5 }
    expect(resizePlacement(placement, 40, 10, false)).toMatchObject({ width: 440, height: 210 })
    // Larger relative change wins: +10% width beats +5% height.
    const locked = resizePlacement(placement, 40, 10, true)
    expect(locked.width).toBeCloseTo(440)
    expect(locked.height).toBeCloseTo(220)
  })

  it('never shrinks the design box below a usable size', () => {
    const placement = { x: 0, y: 0, width: 400, height: 200, split: 0.5 }
    const free = resizePlacement(placement, -1000, -1000, false)
    expect(free.width).toBeGreaterThan(0)
    expect(free.height).toBeGreaterThan(0)
    const locked = resizePlacement(placement, -1000, -1000, true)
    expect(locked.width / locked.height).toBeCloseTo(2)
  })

  it('moves the split to a canvas x position, clamped inside the design box', () => {
    const placement = { x: 100, y: 0, width: 400, height: 200, split: 0.5 }
    expect(setSplit(placement, 200).split).toBe(0.25)
    expect(setSplit(placement, 0).split).toBe(0)
    expect(setSplit(placement, 900).split).toBe(1)
  })

  it('frames both the variant column and the moved design for Fit', () => {
    const column = { x: 0, y: 0, width: 420, height: 752 }
    expect(overlayBounds(column, { x: -50, y: 100, width: 600, height: 900, split: 0.5 })).toEqual({ x: -50, y: 0, width: 600, height: 1000 })
  })

  it('reads stored values defensively', () => {
    expect(parseMode('split')).toBe('split')
    expect(parseMode('grid')).toBe('side-by-side')
    expect(parsePlacement({ x: 1, y: 2, width: 3, height: 4, split: 0.3 })).toEqual({ x: 1, y: 2, width: 3, height: 4, split: 0.3 })
    expect(parsePlacement({ x: 1, y: 2, width: 0, height: 4, split: 0.3 })).toBeUndefined()
    expect(parsePlacement({ x: 1, y: 2, width: 3, height: 4, split: 2 })).toMatchObject({ split: 1 })
    expect(parsePlacement('nope')).toBeUndefined()
  })
})
