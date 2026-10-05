import { describe, expect, it } from 'vitest'
import { intersectRuntimeRects, mapRuntimeViewport } from '../../../../../histoire-app/src/embed/adapters/geometry.js'

describe('preview geometry', () => {
  it('maps exact cell through scaled iframe and clips source/host viewport', () => {
    const target = { storyId: 'one', variantId: 'shared' }
    const cell = { target, x: 20, y: 40, width: 200, height: 100, scale: 1, visibleRect: { x: 20, y: 50, width: 200, height: 90 } }
    expect(mapRuntimeViewport(cell, { x: 10, y: 30, width: 400, height: 300 }, { width: 800, height: 600 }, { x: 0, y: 0, width: 300, height: 90 })).toEqual({ target, x: 20, y: 50, width: 100, height: 50, scale: 0.5, visibleRect: { x: 20, y: 55, width: 100, height: 35 } })
  })

  it('omits completely clipped cells instead of exposing zero-size selected viewport', () => {
    expect(intersectRuntimeRects({ x: 10, y: 50, width: 10, height: 10 }, { x: 0, y: 0, width: 100, height: 40 })).toBe(null)
  })
})
