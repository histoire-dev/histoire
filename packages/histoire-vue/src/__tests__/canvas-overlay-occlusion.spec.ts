import { describe, expect, it } from 'vitest'
import { canvasOverlayIsOccluded, canvasRectsOverlap } from '../../../histoire-app/src/app/components/canvas/canvas-overlay-occlusion.js'

describe('canvas overlay occlusion', () => {
  const header = { left: 100, top: 80, right: 500, bottom: 130 }

  it('detects a rendered iframe behind canvas header information', () => {
    expect(canvasRectsOverlap(header, { left: 240, top: 100, right: 640, bottom: 300 })).toBe(true)
  })

  it('detects a variant label toolbar behind canvas header information', () => {
    expect(canvasOverlayIsOccluded(header, [
      { left: 240, top: 100, right: 640, bottom: 128 },
    ])).toBe(true)
  })

  it('keeps header information visible for adjacent or non-rendered bounds', () => {
    expect(canvasRectsOverlap(header, { left: 500, top: 100, right: 700, bottom: 300 })).toBe(false)
    expect(canvasRectsOverlap(header, { left: 240, top: 130, right: 640, bottom: 300 })).toBe(false)
  })
})
