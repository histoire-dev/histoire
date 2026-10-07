import { describe, expect, it } from 'vitest'
import { rankCanvasStartupFrames } from '../../../histoire-app/src/app/components/canvas/frame-layout.js'

describe('canvas startup ranking', () => {
  it('keeps distance ties in layout order and anchors missing selection to first admitted frame', () => {
    const frames = [
      { id: 'anchor', storyId: 'story', variantId: 'anchor', x: 0, y: 0, width: 100, height: 100 },
      { id: 'north', storyId: 'story', variantId: 'north', x: 0, y: 100, width: 100, height: 100 },
      { id: 'east', storyId: 'story', variantId: 'east', x: 100, y: 0, width: 100, height: 100 },
      { id: 'far', storyId: 'story', variantId: 'far', x: 200, y: 0, width: 100, height: 100 },
      { id: 'offscreen', storyId: 'story', variantId: 'offscreen', x: 1000, y: 1000, width: 100, height: 100 },
    ]
    const admitted = ['far', 'north', 'anchor', 'east']

    expect(rankCanvasStartupFrames(frames, admitted, 'anchor')).toEqual(['anchor', 'north', 'east', 'far'])
    expect(rankCanvasStartupFrames(frames, admitted, null)).toEqual(['far', 'east', 'anchor', 'north'])
    expect(rankCanvasStartupFrames(frames, admitted, 'missing')).not.toContain('offscreen')
  })
})
