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

  it('admits variants by descending visible area instead of distance to viewport center', () => {
    const frames = [
      { id: 'near', storyId: 'story', variantId: 'near', x: 45, y: 45, width: 10, height: 10 },
      { id: 'wide', storyId: 'story', variantId: 'wide', x: 0, y: 0, width: 100, height: 100 },
    ]
    const live = liveCanvasFrames(frames, { x: 0, y: 0, width: 100, height: 100 }, 1, null, 0)

    expect([...live]).toEqual(['wide'])
  })

  it('keeps selected variants ahead of larger visible areas', () => {
    const frames = [
      { id: 'selected', storyId: 'story', variantId: 'selected', x: 45, y: 45, width: 10, height: 10 },
      { id: 'wide', storyId: 'story', variantId: 'wide', x: 0, y: 0, width: 100, height: 100 },
    ]
    const live = liveCanvasFrames(frames, { x: 0, y: 0, width: 100, height: 100 }, 1, 'selected', 0)

    expect([...live]).toEqual(['selected'])
  })

  it('uses margin-only variants only after visible variants, in layout order', () => {
    const frames = [
      { id: 'visible', storyId: 'story', variantId: 'visible', x: 0, y: 0, width: 40, height: 40 },
      { id: 'prefetch-first', storyId: 'story', variantId: 'prefetch-first', x: 101, y: 45, width: 10, height: 10 },
      { id: 'prefetch-second', storyId: 'story', variantId: 'prefetch-second', x: 110, y: 45, width: 10, height: 10 },
    ]
    const live = liveCanvasFrames(frames, { x: 0, y: 0, width: 100, height: 100 }, 3, null, 20)

    expect([...live]).toEqual(['visible', 'prefetch-first', 'prefetch-second'])
  })

  it('updates admission after panning to keep variants with larger visible areas', () => {
    const frames = [
      { id: 'left', storyId: 'story', variantId: 'left', x: 0, y: 0, width: 100, height: 100 },
      { id: 'middle', storyId: 'story', variantId: 'middle', x: 100, y: 0, width: 100, height: 100 },
      { id: 'right', storyId: 'story', variantId: 'right', x: 200, y: 0, width: 100, height: 100 },
    ]

    expect([...liveCanvasFrames(frames, { x: 0, y: 0, width: 180, height: 100 }, 2, null, 0)]).toEqual(['left', 'middle'])
    expect([...liveCanvasFrames(frames, { x: 120, y: 0, width: 180, height: 100 }, 2, null, 0)]).toEqual(['right', 'middle'])
  })

  it('normalizes fractional and non-finite budgets before admitting frames', () => {
    const frames = [
      { id: 'first', storyId: 'story', variantId: 'first', x: 0, y: 0, width: 100, height: 100 },
      { id: 'second', storyId: 'story', variantId: 'second', x: 0, y: 0, width: 80, height: 80 },
      { id: 'third', storyId: 'story', variantId: 'third', x: 0, y: 0, width: 60, height: 60 },
    ]
    const viewport = { x: 0, y: 0, width: 100, height: 100 }

    expect([...liveCanvasFrames(frames, viewport, 2.9, null, 0)]).toEqual(['first', 'second'])
    expect([...liveCanvasFrames(frames, viewport, Number.NaN, null, 0)]).toEqual(['first'])
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
