import { describe, expect, it } from 'vitest'
import { CANVAS_FRAME_LABEL_HEIGHT, canvasFrameBounds, layoutCanvasFrames } from '../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { canvasToClient, fitCanvas } from '../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'

const preview = { width: 320, height: 180 }

describe('canvas frame layout', () => {
  it('places List titles above previews with the requested 88px separation', () => {
    const [first, second] = layoutCanvasFrames('story', ['first', 'second'], preview, 'list')

    expect(first).toMatchObject({ x: 0, y: 0, width: 320, height: 208 })
    expect(second).toMatchObject({ x: 0, y: 296, width: 320, height: 208 })
    expect(second.y - (first.y + CANVAS_FRAME_LABEL_HEIGHT + preview.height)).toBe(88)
    expect(canvasFrameBounds([first, second])).toEqual({ x: 0, y: 0, width: 320, height: 504 })
  })

  it('keeps List title chrome and separation fixed in screen pixels while zoomed', () => {
    const [first, second] = layoutCanvasFrames('story', ['first', 'second'], preview, 'list', 3, 0.5)
    const firstPreviewBottom = first.y + CANVAS_FRAME_LABEL_HEIGHT / 0.5 + preview.height

    expect(first.height).toBe(236)
    expect(second.y).toBe(412)
    expect((second.y - firstPreviewBottom) * 0.5).toBe(88)
  })

  it('keeps every List title and preview inside Fit bounds', () => {
    const frames = layoutCanvasFrames('story', ['first', 'second'], preview, 'list')
    const bounds = canvasFrameBounds(frames)
    const fit = fitCanvas(bounds, { width: 800, height: 500 }, { padding: 32 })
    const start = canvasToClient({ x: bounds.x, y: bounds.y }, fit.zoom, fit.offset)
    const end = canvasToClient({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, fit.zoom, fit.offset)

    expect(start.x).toBeGreaterThanOrEqual(32)
    expect(start.y).toBeGreaterThanOrEqual(32)
    expect(end.x).toBeLessThanOrEqual(768)
    expect(end.y).toBeLessThanOrEqual(468)
  })

  it('leaves Grid geometry unchanged', () => {
    const frames = layoutCanvasFrames('story', ['first', 'second'], preview, 'grid')

    expect(frames.map(frame => ({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }))).toEqual([
      { x: 0, y: 0, width: 320, height: 212 },
      { x: 344, y: 0, width: 320, height: 212 },
    ])
  })
})
