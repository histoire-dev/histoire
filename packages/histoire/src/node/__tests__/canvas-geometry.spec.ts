import { describe, expect, it } from 'vitest'
import { layoutMatrixFrames, MATRIX_TOP_INSET, matrixLayoutBounds } from '../../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { canvasToClient } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { expandMatrixCells } from '../../../../histoire-app/src/app/util/matrix.js'

const bounds = { x: 0, y: 0, width: 720, height: 640 }
const frame = { ...bounds, id: 'frame', storyId: 'story', variantId: 'variant' }

describe('canvas geometry ownership', () => {
  it('keeps Fit pending until measured viewport exists and refits after selection focus', () => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 0, height: 0 }, bounds, 300, { topInset: 184 })
    canvas.focusFrame(frame)
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBe(1)
    expect(canvas.panOffset).toEqual({ x: 32, y: 72 })
    canvas.setGeometry({ width: 1200, height: 900 }, bounds, 300, { topInset: 184 })
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBeGreaterThan(0.8)
    const start = canvasToClient(bounds, canvas.effectiveZoom, canvas.panOffset)
    expect(start.y).toBeGreaterThanOrEqual(216)
  })

  it('automatic selection focus preserves Fit while manual pan selects numeric zoom', () => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 400, height: 300 }, bounds)
    canvas.focusFrame({ ...frame, x: 5000, y: 5000 })
    expect(canvas.zoom).toBe('fit')
    canvas.setGeometry({ width: 900, height: 700 }, bounds)
    expect(canvas.effectiveZoom).toBeGreaterThan(0.9)
    canvas.panBy({ x: 10, y: 20 })
    expect(canvas.zoom).toBe(canvas.effectiveZoom)
  })

  it('moves numeric transform with changed chrome inset without discarding zoom or manual pan', () => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 1200, height: 900 }, bounds)
    canvas.setZoom(0.7)
    const previous = { ...canvas.panOffset }
    canvas.setGeometry({ width: 1200, height: 900 }, bounds, 300, { topInset: 184 })
    expect(canvas.zoom).toBe(0.7)
    expect(canvas.panOffset).toEqual({ x: previous.x, y: previous.y + 184 })
    canvas.panBy({ x: -20, y: -30 })
    canvas.setGeometry({ width: 1200, height: 900 }, bounds, 300, { topInset: 184 })
    expect(canvas.panOffset).toEqual({ x: previous.x - 20, y: previous.y + 154 })
    canvas.setGeometry({ width: 1200, height: 900 }, bounds)
    expect(canvas.zoom).toBe(0.7)
    expect(canvas.panOffset).toEqual({ x: previous.x - 20, y: previous.y - 30 })
  })

  it('converges matrix Fit after a narrow viewport expands, keeping previews clear of controls', () => {
    const canvas = createCanvasStore()
    const rows = { name: 'disabled', values: [false, true] }
    const cols = { name: 'active', values: [false, true] }
    const cells = expandMatrixCells('story', rows, cols, {})
    /** Reproduce layout's reactive zoom feedback until transform settles. */
    function settle(width: number) {
      for (let index = 0; index < 20; index++) {
        const frames = layoutMatrixFrames(cells, { storyId: 'story', variantId: 'variant', rows: rows.values, cols: cols.values, size: bounds, zoom: canvas.effectiveZoom })
        canvas.setGeometry({ width, height: 900 }, matrixLayoutBounds(frames), 380, { topInset: MATRIX_TOP_INSET })
      }
      return layoutMatrixFrames(cells, { storyId: 'story', variantId: 'variant', rows: rows.values, cols: cols.values, size: bounds, zoom: canvas.effectiveZoom })
    }
    settle(500)
    expect(canvas.effectiveZoom).toBe(0.1)
    const frames = settle(1104)
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBeCloseTo((1104 - 380 - 64 - 144) / 1440, 3)
    expect(frames[0].width * canvas.effectiveZoom).toBeGreaterThan(250)
    const start = canvasToClient(frames[0], canvas.effectiveZoom, canvas.panOffset)
    const last = frames.at(-1)!
    const end = canvasToClient({ x: last.x + last.width, y: last.y + last.height }, canvas.effectiveZoom, canvas.panOffset)
    expect(start.y).toBeGreaterThanOrEqual(MATRIX_TOP_INSET + 32 + 28)
    expect(end.x).toBeLessThanOrEqual(1104 - 380 - 31)
    expect(end.y).toBeLessThanOrEqual(869)
  })
})
