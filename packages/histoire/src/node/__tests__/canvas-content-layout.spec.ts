import { describe, expect, it } from 'vitest'
import { canvasFrameBounds, keepFrameLayouts, layoutCanvasFrames, liveCanvasFrames, visibleCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { layoutMatrixFrames, matrixLayoutBounds } from '../../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { expandMatrixCells } from '../../../../histoire-app/src/app/util/matrix.js'

const sizes = [{ width: 100, height: 400 }, { width: 200, height: 20 }, { width: 80, height: 60 }, { width: 300, height: 50 }]

describe('content-sized canvas layout', () => {
  it('fills each grid row and column and keeps the expanded card area visible', () => {
    const frames = layoutCanvasFrames('story', ['0', '1', '2', '3'], id => sizes[Number(id)], 'grid', 2)
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 100, height: 432 },
      { x: 124, y: 0, width: 300, height: 432 },
      { x: 0, y: 456, width: 100, height: 92 },
      { x: 124, y: 456, width: 300, height: 92 },
    ])
    expect(canvasFrameBounds(frames)).toEqual({ x: 0, y: 0, width: 424, height: 548 })
    expect(visibleCanvasFrames(frames, { x: 350, y: 200, width: 40, height: 80 }).map(frame => frame.variantId)).toEqual(['1'])
  })

  it('admits visible Grid content ahead of an empty part of a taller card', () => {
    const ids = ['0', '1', '2', '3']
    const frames = layoutCanvasFrames('story', ids, id => sizes[Number(id)], 'grid', 2)
    const viewport = { x: 350, y: 200, width: 40, height: 300 }
    expect([...liveCanvasFrames(frames, viewport, 2, frames[0].id)]).toEqual([frames[0].id, frames[3].id])

    const grown = layoutCanvasFrames('story', ids, id => id === '1' ? { width: 250, height: 380 } : sizes[Number(id)], 'grid', 2)
    // The card still fills the same tracks, but its newly visible content earns a live slot.
    const relaid = keepFrameLayouts(frames, grown)
    expect([...liveCanvasFrames(relaid, viewport, 2, frames[0].id)]).toEqual([frames[0].id, frames[1].id])
  })

  it('accumulates actual List heights while retaining fixed screen-space gaps and labels', () => {
    const frames = layoutCanvasFrames('story', ['0', '1', '2'], id => sizes[Number(id)], 'list', 3, 0.5)
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 100, height: 456 },
      { x: 0, y: 632, width: 200, height: 76 },
      { x: 0, y: 884, width: 80, height: 116 },
    ])
  })

  it('fills Matrix tracks while keeping each projection at its measured size', () => {
    const cells = sizes.map((_, index) => ({ key: String(index), row: Math.floor(index / 2), col: index % 2, props: {} }))
    const frames = layoutMatrixFrames(cells, { storyId: 'story', variantId: 'variant', rows: [0, 1], cols: [0, 1], size: cell => sizes[Number(cell.key)], zoom: 1 })
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 128, y: 28, width: 100, height: 400 },
      { x: 244, y: 28, width: 300, height: 400 },
      { x: 128, y: 444, width: 100, height: 60 },
      { x: 244, y: 444, width: 300, height: 60 },
    ])
    expect(matrixLayoutBounds(frames)).toEqual({ x: 0, y: 0, width: 544, height: 504 })
  })

  it('measures a visible Matrix larger than its live budget over successive admissions', () => {
    const rows = [0, 1]
    const cols = Array.from({ length: 8 }, (_, index) => index)
    const cells = expandMatrixCells('story', { name: 'row', values: rows }, { name: 'col', values: cols }, {})
    const measured = new Set<string>()
    const viewport = { x: 0, y: 0, width: 6200, height: 1440 }
    for (let batch = 0; batch < 4; batch++) {
      const frames = layoutMatrixFrames(cells, {
        storyId: 'story',
        variantId: 'variant',
        rows,
        cols,
        size: cell => measured.has(cell.key) ? { width: 100, height: 50 } : { width: 720, height: 640 },
        zoom: 1,
      })
      // An admitted document reports its intrinsic size before the next ranking.
      const admitted = liveCanvasFrames(frames, viewport, 5, null)
      expect(admitted.size).toBe(5)
      for (const id of admitted) measured.add(id)
    }
    expect(measured).toEqual(new Set(cells.map(cell => cell.key)))
  })

  it('persists mode without changing remembered zoom and tolerates legacy preferences', () => {
    let saved = JSON.stringify({ version: 3, zoomByArrange: { grid: 0.75 }, tool: 'pan' })
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => {
      saved = value
    } }
    const canvas = createCanvasStore({ storage })
    expect(canvas.autoFitContent).toBe(false)
    canvas.setAutoFitContent(true)
    const restored = createCanvasStore({ storage })
    expect(restored.autoFitContent).toBe(true)
    expect(restored.zoomByArrange.grid).toBe(0.75)
    expect(restored.tool).toBe('pan')
    expect(createCanvasStore().autoFitContent).toBe(false)
  })

  it('retains independent frame sizes across virtualization but rejects replaced source or props identities', () => {
    const canvas = createCanvasStore()
    canvas.contentSizes.set('first', 'source:1:props:false', { width: 120, height: 60 })
    canvas.contentSizes.set('second', 'source:1:props:false', { width: 200, height: 90 })
    expect(canvas.contentSizes.get('first', 'source:1:props:false')).toEqual({ width: 120, height: 60 })
    expect(canvas.contentSizes.get('second', 'source:1:props:false')).toEqual({ width: 200, height: 90 })
    expect(canvas.contentSizes.get('first', 'source:2:props:false')).toBeUndefined()
    expect(canvas.contentSizes.get('first', 'source:1:props:true')).toBeUndefined()
    canvas.contentSizes.set('first', 'source:2:props:true', { width: 300, height: 150 })
    expect(canvas.contentSizes.get('first', 'source:1:props:false')).toBeUndefined()
    expect(canvas.contentSizes.get('first', 'source:2:props:true')).toEqual({ width: 300, height: 150 })
    expect(createCanvasStore().contentSizes.get('first', 'source:2:props:true')).toBeUndefined()
  })
})
