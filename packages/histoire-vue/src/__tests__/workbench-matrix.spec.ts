import { describe, expect, it, vi } from 'vitest'
import { layoutMatrixFrames, matrixLayoutBounds } from '../../../histoire-app/src/app/components/canvas/matrix/matrix-layout.js'
import { watchMatrixFrameSelection } from '../../../histoire-app/src/app/components/canvas/matrix/matrix-selection.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createMatrixStore } from '../../../histoire-app/src/app/stores/matrix.js'
import { discoverMatrixAxes, discoverMatrixProps, expandMatrixCells, getMatrixState, matrixCellKey, matrixVariantSnippet } from '../../../histoire-app/src/app/util/matrix.js'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { MEASURE_REQUEST } from '../../../histoire-shared/src/types/preview-message.js'

describe('props matrix behavior', () => {
  const definitions = [{ index: 0, name: 'Button', props: [{ name: 'size', types: ['string'], values: ['sm', 'md'] }, { name: 'disabled', types: ['boolean'] }, { name: 'label', types: ['string'] }, { name: 'count', types: ['number'] }] }]

  it('discovers finite definitions and explicit hints without guessing free text or numbers', () => {
    expect(discoverMatrixAxes(definitions, { axes: { variant: ['primary', 'danger'], size: ['sm', 'md', 'lg'] } })).toEqual([
      { name: 'size', values: ['sm', 'md', 'lg'] },
      { name: 'disabled', values: [false, true] },
      { name: 'variant', values: ['primary', 'danger'] },
    ])
  })

  it('accepts array-root SDK state without treating array indices as named props', () => {
    expect(getMatrixState([false, true])).toEqual({})
    expect(discoverMatrixProps([{ label: 'Array item' }])).toEqual([])
  })

  it('reads actual source scalars and explicit state before component defaults', () => {
    const props = discoverMatrixProps({
      _hPropDefs: [{ index: 0, props: [{ name: 'label', types: ['string'], default: 'Default', value: 'Preset B' }, { name: 'count', types: ['number'], default: 0 }] }],
      count: 2,
    })
    expect(props.map(prop => [prop.name, prop.value])).toEqual([['label', 'Preset B'], ['count', 2]])
  })

  it('expands stable typed keys, applies empty filters, and gives axes precedence over base props', () => {
    const axes = discoverMatrixAxes(definitions)
    const cells = expandMatrixCells('story', axes[0], axes[1], { size: 'wrong', label: 'Continue' })
    expect(cells).toHaveLength(4)
    expect(cells[0].props).toEqual({ size: 'sm', disabled: false, label: 'Continue' })
    expect(cells.map(cell => cell.key)).toEqual(expandMatrixCells('story', axes[0], axes[1], { label: 'Changed' }).map(cell => cell.key))
    expect(expandMatrixCells('story', axes[0], axes[1], {}, [], [true])).toEqual([])
    expect(matrixCellKey('story', 'size', 1, 'disabled', false)).not.toBe(matrixCellKey('story', 'size', '1', 'disabled', false))
  })

  it('keeps matrix chrome in screen pixels while preserving logical preview dimensions', () => {
    const axes = discoverMatrixAxes(definitions)
    const cells = expandMatrixCells('story', axes[0], axes[1], {})
    for (const zoom of [0.1, 0.5, 1]) {
      const frames = layoutMatrixFrames(cells, { storyId: 'story', variantId: 'preset', rows: axes[0].values, cols: axes[1].values, size: { width: 720, height: 640 }, zoom })
      expect(frames[0]).toMatchObject({ width: 720, height: 640 })
      expect(frames[0].x * zoom).toBe(128)
      expect(frames[0].y * zoom).toBe(28)
      expect((frames[1].x - frames[0].x - 720) * zoom).toBeCloseTo(16)
      expect((frames[2].y - frames[0].y - 640) * zoom).toBeCloseTo(16)
      const bounds = matrixLayoutBounds(frames)
      expect(bounds.x).toBe(0)
      expect(bounds.y).toBe(0)
      expect(bounds.width * zoom).toBeCloseTo(128 + 720 * zoom * 2 + 16)
      expect(bounds.height * zoom).toBeCloseTo(28 + 640 * zoom * 2 + 16)
    }
  })

  it('targets selected passive cell for measurement and clears only its owned canvas target', () => {
    const store = createMatrixStore()
    const canvas = createCanvasStore()
    const registry = createCanvasFrames(canvas)
    store.activate('story', discoverMatrixAxes(definitions), {})
    const cell = store.cells.value[0]
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage')
    const unregister = registry.registerFrame({ id: cell.key, storyId: 'story', variantId: 'preset', rect: { x: 0, y: 0, width: 720, height: 640 }, iframe, documentId: 'passive-document' })
    canvas.selectedFrame = 'canonical-frame'
    const stop = watchMatrixFrameSelection(store, canvas)
    try {
      expect(canvas.selectedFrame).toBeNull()
      store.selectCell(cell.key)
      const target = registry.getFrame(canvas.selectedFrame!)!
      expect(target).toMatchObject({ id: cell.key, storyId: 'story', variantId: 'preset', documentId: 'passive-document' })
      registry.postToFrame(target.id, { type: MEASURE_REQUEST, storyId: target.storyId, variantId: target.variantId, requestId: 'measure-cell', x: 10, y: 20 })
      expect(postMessage).toHaveBeenCalledWith({ type: MEASURE_REQUEST, storyId: 'story', variantId: 'preset', requestId: 'measure-cell', x: 10, y: 20, __histoire: true, documentId: 'passive-document' }, window.location.origin)
      store.setFilter('rows', [])
      expect(canvas.selectedFrame).toBeNull()
      store.setFilter('rows', [cell.row])
      store.selectCell(cell.key)
      stop()
      expect(canvas.selectedFrame).toBeNull()
      const nextStop = watchMatrixFrameSelection(store, canvas)
      canvas.selectedFrame = 'successor-frame'
      nextStop()
      expect(canvas.selectedFrame).toBe('successor-frame')
    }
    finally {
      stop()
      unregister()
      postMessage.mockRestore()
      iframe.remove()
      store.close()
    }
  })

  it('restores valid URL axes, swaps filters, persists base edits, and keeps selection local', () => {
    window.localStorage.removeItem('_histoire-ui-matrix/story')
    const store = createMatrixStore({ storage: window.localStorage })
    const axes = discoverMatrixAxes(definitions)
    try {
      store.activate('story', axes, { label: 'Continue' }, { rows: 'missing', cols: 'size' })
      expect(store.rows.value).toBe('disabled')
      expect(store.cols.value).toBe('size')
      store.setFilter('rows', [true])
      expect(store.cells.value).toHaveLength(2)
      const cell = store.cells.value[0]
      store.selectCell(cell.key)
      store.setBase('label', 'Save')
      expect(store.selectedCell.value?.props.label).toBe('Save')
      expect(store.cells.value.every(cell => cell.props.label === 'Save')).toBe(true)
      store.swapAxes()
      expect(store.rows.value).toBe('size')
      expect(store.colValues.value).toEqual([true])
      const persisted = JSON.parse(window.localStorage.getItem('_histoire-ui-matrix/story')!)
      expect(persisted).toMatchObject({ rows: 'size', cols: 'disabled', colValues: [true], base: { label: 'Save' } })
      store.activate('other', axes, { label: 'Other' })
      expect(store.selectedCell.value).toBeUndefined()
      expect(store.base.value.label).toBe('Other')
      store.activate('story', axes, { label: 'Runtime changed' })
      expect(store.base.value.label).toBe('Save')
    }
    finally {
      store.close()
      window.localStorage.removeItem('_histoire-ui-matrix/story')
      window.localStorage.removeItem('_histoire-ui-matrix/other')
    }
  })

  it('re-seeds untouched base props across two presets while retaining explicit edits', () => {
    window.localStorage.removeItem('_histoire-ui-matrix/presets')
    const store = createMatrixStore({ storage: window.localStorage })
    const axes = discoverMatrixAxes(definitions)
    try {
      store.activate('presets', axes, { label: 'Preset A', count: 1 })
      expect(store.cells.value.every(cell => cell.props.label === 'Preset A')).toBe(true)
      expect(JSON.parse(window.localStorage.getItem('_histoire-ui-matrix/presets')!).base).toEqual({})
      store.activate('presets', axes, { label: 'Preset B', count: 2 })
      expect(store.cells.value.every(cell => cell.props.label === 'Preset B')).toBe(true)
      expect(store.base.value.count).toBe(2)
      store.setBase('label', 'User edit')
      store.activate('presets', axes, { label: 'Preset A', count: 1 })
      expect(store.base.value).toEqual({ label: 'User edit', count: 1 })
      expect(JSON.parse(window.localStorage.getItem('_histoire-ui-matrix/presets')!).base).toEqual({ label: 'User edit' })
      store.resetBase({ label: 'Preset A', count: 1 })
      store.activate('presets', axes, { label: 'Preset B', count: 2 })
      expect(store.base.value).toEqual({ label: 'Preset B', count: 2 })
    }
    finally {
      store.close()
      window.localStorage.removeItem('_histoire-ui-matrix/presets')
    }
  })

  it('copies generated framework body in Variant snippet and refuses retired cell generators', async () => {
    const store = createMatrixStore()
    const axes = discoverMatrixAxes(definitions)
    store.activate('story', axes, {})
    const cell = store.cells.value[0]
    store.selectCell(cell.key)
    const release = store.registerSource(cell.key, async () => '<Button size="sm" />')
    expect(await store.sourceForSelected()).toBe('<Button size="sm" />')
    expect(matrixVariantSnippet('Small "button"', '<Button size="sm" />')).toBe('<Variant title="Small &quot;button&quot;">\n  <Button size="sm" />\n</Variant>')
    release()
    await expect(store.sourceForSelected()).rejects.toThrow('Selected matrix cell is not ready')
    store.close()
  })

  it('rejects source completion after base props change', async () => {
    const store = createMatrixStore()
    const source = deferred<string>()
    store.activate('story', discoverMatrixAxes(definitions), { label: 'Continue' })
    const cell = store.cells.value[0]
    store.selectCell(cell.key)
    const release = store.registerSource(cell.key, () => source.promise)
    const pending = store.sourceForSelected()
    store.setBase('label', 'Changed')
    source.resolve('<Button />')
    await expect(pending).rejects.toThrow('Selected matrix cell changed')
    release()
    store.close()
  })
})
