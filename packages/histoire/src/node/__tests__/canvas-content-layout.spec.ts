import { describe, expect, it } from 'vitest'
import { canvasFrameBounds, layoutCanvasFrames, visibleCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { layoutMatrixFrames, matrixLayoutBounds } from '../../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'

const sizes = [{ width: 100, height: 400 }, { width: 200, height: 20 }, { width: 80, height: 60 }, { width: 300, height: 50 }]

describe('content-sized canvas layout', () => {
  it('uses each variant size and reserves largest grid track without losing tall visible siblings', () => {
    const frames = layoutCanvasFrames('story', ['0', '1', '2', '3'], id => sizes[Number(id)], 'grid')
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 100, height: 432 },
      { x: 324, y: 0, width: 200, height: 52 },
      { x: 548, y: 0, width: 80, height: 92 },
      { x: 0, y: 456, width: 300, height: 82 },
    ])
    expect(canvasFrameBounds(frames)).toEqual({ x: 0, y: 0, width: 628, height: 538 })
    expect(visibleCanvasFrames(frames, { x: 0, y: 200, width: 700, height: 80 }).map(frame => frame.variantId)).toEqual(['0'])
  })

  it('accumulates actual List heights while retaining fixed screen-space gaps and labels', () => {
    const frames = layoutCanvasFrames('story', ['0', '1', '2'], id => sizes[Number(id)], 'list', 3, 0.5)
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 100, height: 456 },
      { x: 0, y: 632, width: 200, height: 76 },
      { x: 0, y: 884, width: 80, height: 116 },
    ])
  })

  it('sizes Matrix cells independently and reserves complete row and column tracks', () => {
    const cells = sizes.map((_, index) => ({ key: String(index), row: Math.floor(index / 2), col: index % 2, props: {} }))
    const frames = layoutMatrixFrames(cells, { storyId: 'story', variantId: 'variant', rows: [0, 1], cols: [0, 1], size: cell => sizes[Number(cell.key)], zoom: 1 })
    expect(frames.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 128, y: 28, width: 100, height: 400 },
      { x: 244, y: 28, width: 200, height: 20 },
      { x: 128, y: 444, width: 80, height: 60 },
      { x: 244, y: 444, width: 300, height: 50 },
    ])
    expect(matrixLayoutBounds(frames)).toEqual({ x: 0, y: 0, width: 544, height: 504 })
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
