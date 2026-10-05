import { getHistoireTargetKey } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { canvasFrameBounds, layoutCanvasFrames, liveCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'

describe('canvas frame admission', () => {
  it('enforces budget while keeping selected frame alive outside viewport', () => {
    const frames = layoutCanvasFrames('story', Array.from({ length: 30 }, (_, index) => String(index)), { width: 208, height: 180 }, 'grid')
    const selected = getHistoireTargetKey({ storyId: 'story', variantId: '29' })
    const live = liveCanvasFrames(frames, { x: 0, y: 0, width: 1200, height: 1000 }, 4, selected, 0)
    expect(live.size).toBe(4)
    expect(live.has(selected)).toBe(true)
    const moved = liveCanvasFrames(frames, { x: 0, y: 1800, width: 1200, height: 1000 }, 4, selected, 0)
    expect(moved.size).toBeLessThanOrEqual(4)
    expect(moved.has(selected)).toBe(true)
    expect([...moved]).not.toEqual([...live])
  })

  it('includes preview labels in fit bounds and preserves variant order', () => {
    const frames = layoutCanvasFrames('story', ['a', 'b', 'c', 'd'], { width: 200, height: 180 }, 'grid')
    expect(frames.map(frame => frame.variantId)).toEqual(['a', 'b', 'c', 'd'])
    expect(canvasFrameBounds(frames)).toEqual({ x: 0, y: 0, width: 648, height: 448 })
    expect(layoutCanvasFrames('story', ['a', 'b'], { width: 200, height: 180 }, 'list').every(frame => frame.x === 0)).toBe(true)
  })

  it('uses collision-free targets and keeps gaps readable at low zoom', () => {
    const one = layoutCanvasFrames('a/b', ['c'], { width: 100, height: 100 }, 'grid')
    const two = layoutCanvasFrames('a', ['b/c'], { width: 100, height: 100 }, 'grid')
    expect(one[0].id).not.toBe(two[0].id)
    const frames = layoutCanvasFrames('story', ['a', 'b'], { width: 100, height: 100 }, 'grid', 3, 0.2)
    expect((frames[1].x - frames[0].width) * 0.2).toBe(24)
  })
})
