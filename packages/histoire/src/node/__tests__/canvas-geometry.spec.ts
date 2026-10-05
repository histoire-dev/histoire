import { describe, expect, it } from 'vitest'
import { canvasFrameBounds, layoutCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { layoutMatrixFrames, MATRIX_COLUMN_HEADER, MATRIX_TOP_INSET, matrixLayoutBounds } from '../../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { canvasToClient, clientToCanvas } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
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
    expect(canvas.panOffset).toEqual({ x: 32, y: 32 })
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

  it('anchors numeric toolbar zoom in the unobstructed viewport while preserving cursor zoom', () => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 1200, height: 900 }, bounds, 400, { topInset: 120, bottomInset: 60 })
    const center = { x: 400, y: 480 }
    const anchor = clientToCanvas(center, canvas.effectiveZoom, canvas.panOffset)
    canvas.setZoom(2)
    expect(canvasToClient(anchor, canvas.effectiveZoom, canvas.panOffset)).toEqual(center)
    const cursor = { x: 172, y: 250 }
    const cursorAnchor = clientToCanvas(cursor, canvas.effectiveZoom, canvas.panOffset)
    canvas.setZoom(0.5, cursor)
    expect(canvasToClient(cursorAnchor, canvas.effectiveZoom, canvas.panOffset)).toEqual(cursor)
  })

  it('preserves saved numeric zoom and reveals oversized frame starts instead of trailing edges', () => {
    const canvas = createCanvasStore({ storage: { getItem: () => '{"zoom":0.67}', setItem: () => {} } })
    canvas.setGeometry({ width: 800, height: 500 }, bounds, 300, { topInset: 120, bottomInset: 40 })
    canvas.focusFrame({ ...frame, x: 1000, y: 1000, width: 1000, height: 1000 })
    expect(canvas.zoom).toBe(0.67)
    expect(canvasToClient({ x: 1000, y: 1000 }, canvas.effectiveZoom, canvas.panOffset)).toEqual({ x: 24, y: 144 })
  })

  it.each(['grid', 'list'] as const)('converges %s Fit with screen-space labels below header and above footer', (arrange) => {
    const canvas = createCanvasStore()
    let frames = layoutCanvasFrames('story', ['a', 'b', 'c', 'd'], bounds, arrange)
    for (let index = 0; index < 40; index++) {
      canvas.setGeometry({ width: 1200, height: 900 }, canvasFrameBounds(frames), 300, { topInset: 120, bottomInset: 60 })
      frames = layoutCanvasFrames('story', ['a', 'b', 'c', 'd'], bounds, arrange, 3, canvas.effectiveZoom)
    }
    const extent = canvasFrameBounds(frames)
    const start = canvasToClient(extent, canvas.effectiveZoom, canvas.panOffset)
    const end = canvasToClient({ x: extent.width, y: extent.height }, canvas.effectiveZoom, canvas.panOffset)
    expect(start.x).toBeGreaterThanOrEqual(31.9)
    expect(start.y).toBeGreaterThanOrEqual(151.9)
    expect(end.x).toBeLessThanOrEqual(868.1)
    expect(end.y).toBeLessThanOrEqual(808.1)
    const before = { zoom: canvas.effectiveZoom, offset: { ...canvas.panOffset } }
    canvas.setGeometry({ width: 1200, height: 900 }, extent, 300, { topInset: 120, bottomInset: 60 })
    expect(canvas.effectiveZoom).toBe(before.zoom)
    expect(canvas.panOffset.x).toBeCloseTo(before.offset.x, 2)
    expect(canvas.panOffset.y).toBeCloseTo(before.offset.y, 2)
  })

  it('fits selection between fixed overlays and records numeric zoom', () => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 1200, height: 600 }, bounds, 300, { topInset: 120, bottomInset: 60 })
    canvas.zoomToFrame(frame)
    const start = canvasToClient(frame, canvas.effectiveZoom, canvas.panOffset)
    const end = canvasToClient({ x: frame.width, y: frame.height }, canvas.effectiveZoom, canvas.panOffset)
    expect(start.y).toBe(152)
    expect(end.y).toBe(508)
    expect(canvas.zoom).toBe(canvas.effectiveZoom)
  })

  it('pins minimum selection Fit below fixed overlays', () => {
    const canvas = createCanvasStore()
    const oversized = { ...frame, width: 10000, height: 100 }
    canvas.setGeometry({ width: 1200, height: 600 }, bounds, 300, { topInset: 120, bottomInset: 60 })
    canvas.zoomToFrame(oversized)
    const start = canvasToClient(oversized, canvas.effectiveZoom, canvas.panOffset)
    expect(canvas.zoom).toBe(0.1)
    expect(start.y).toBe(152)
  })

  it.each(['grid', 'list'] as const)('fits %s selection using label bounds at target zoom', (arrange) => {
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 1000, height: 760 }, bounds, 300, { topInset: 120, bottomInset: 40 })
    canvas.setZoom(0.15)
    /** Selection layout includes fixed-pixel labels and preceding row/column gaps. */
    const selected = (zoom: number) => layoutCanvasFrames('story', ['a', 'b', 'c', 'd'], bounds, arrange, 3, zoom)[3]
    canvas.zoomToFrame(selected)
    const fitted = selected(canvas.effectiveZoom)
    const start = canvasToClient(fitted, canvas.effectiveZoom, canvas.panOffset)
    const end = canvasToClient({ x: fitted.x + fitted.width, y: fitted.y + fitted.height }, canvas.effectiveZoom, canvas.panOffset)
    expect(start.x).toBeGreaterThanOrEqual(31.9)
    expect(start.y).toBeGreaterThanOrEqual(151.9)
    expect(end.x).toBeLessThanOrEqual(668.1)
    expect(end.y).toBeLessThanOrEqual(688.1)
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
        canvas.setGeometry({ width, height: 900 }, matrixLayoutBounds(frames), 380, { topInset: MATRIX_TOP_INSET, bottomInset: 60 })
      }
      return layoutMatrixFrames(cells, { storyId: 'story', variantId: 'variant', rows: rows.values, cols: cols.values, size: bounds, zoom: canvas.effectiveZoom })
    }
    const narrowFrames = settle(500)
    expect(canvas.effectiveZoom).toBe(0.1)
    expect(canvasToClient(narrowFrames[0], canvas.effectiveZoom, canvas.panOffset).y).toBe(MATRIX_TOP_INSET + 32 + MATRIX_COLUMN_HEADER)
    const frames = settle(1104)
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBeCloseTo((1104 - 380 - 64 - 144) / 1440, 3)
    expect(frames[0].width * canvas.effectiveZoom).toBeGreaterThan(250)
    const start = canvasToClient(frames[0], canvas.effectiveZoom, canvas.panOffset)
    const last = frames.at(-1)!
    const end = canvasToClient({ x: last.x + last.width, y: last.y + last.height }, canvas.effectiveZoom, canvas.panOffset)
    expect(start.y).toBeGreaterThanOrEqual(MATRIX_TOP_INSET + 32 + 28)
    expect(end.x).toBeLessThanOrEqual(1104 - 380 - 31)
    expect(end.y).toBeLessThanOrEqual(809)
  })
})
