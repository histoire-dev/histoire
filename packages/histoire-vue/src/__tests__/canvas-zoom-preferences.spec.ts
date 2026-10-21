import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import MatrixView from '../../../histoire-app/src/app/components/canvas/matrix/MatrixView.vue'
import ZoomMenu from '../../../histoire-app/src/app/components/canvas/toolbar/ZoomMenu.vue'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { type CanvasStorage, type CanvasStore, createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../../../histoire-app/src/app/stores/story-canvas-views.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

/** In-memory storage exposes persisted canvas preferences without browser state. */
function createStorage(initial?: Record<string, unknown>): CanvasStorage & { value: (key: string) => unknown } {
  const entries = new Map(Object.entries(initial ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]))
  return {
    getItem(key) { return entries.get(key) ?? null },
    setItem(key, value) { entries.set(key, value) },
    value(key) {
      const value = entries.get(key)
      return value ? JSON.parse(value) : undefined
    },
  }
}

describe('canvas zoom preferences', () => {
  it('merges automatic zoom actions in Single and preserves selection zoom elsewhere', async () => {
    const canvas = createCanvasStore()
    const frames = createCanvasFrames(canvas)
    const rect = { x: 0, y: 0, width: 720, height: 640 }
    canvas.setArrangement('single')
    canvas.setGeometry({ width: 1200, height: 900 }, rect)
    canvas.selectedFrame = 'frame'
    canvas.setZoom(0.5)
    const remove = frames.registerFrame({ id: 'frame', storyId: 'story', variantId: 'variant', rect })
    const Host = defineComponent({
      setup() {
        provideCanvas(canvas, frames)
        return () => h(ZoomMenu, { open: 'zoom' })
      },
    })
    const wrapper = mount(Host, { global: { stubs: { ToolbarPopover: { template: '<div><slot name="trigger" /><slot /></div>' } } } })
    try {
      expect(wrapper.findAll('button').some(button => button.text().startsWith('Fit to canvas'))).toBe(true)
      expect(wrapper.findAll('button').some(button => button.text().startsWith('Zoom to selection'))).toBe(false)
      canvas.setArrangement('list')
      await nextTick()
      const button = wrapper.findAll('button').find(button => button.text().startsWith('Zoom to selection'))!
      expect(button.attributes('disabled')).toBeUndefined()
      await button.trigger('click')
      expect(canvas.zoom).toBe('selection')
      expect(button.attributes('aria-pressed')).toBe('true')
      remove()
      await nextTick()
      expect(button.attributes('disabled')).toBeDefined()
    }
    finally { wrapper.unmount() }
  })

  it('persists automatic-mode cancellation on drag without saving every movement', () => {
    const storage = createStorage()
    const save = vi.spyOn(storage, 'setItem')
    const canvas = createCanvasStore({ storage })
    canvas.setArrangement('list')
    canvas.setGeometry({ width: 1200, height: 900 }, { x: 0, y: 0, width: 720, height: 640 }, 0, {}, { x: 0, y: 0, width: 720, height: 640 })
    save.mockClear()
    canvas.setPanOffset({ x: 50, y: 50 })
    canvas.setPanOffset({ x: 60, y: 60 })
    expect(save).toHaveBeenCalledOnce()
    expect(createCanvasStore({ storage }).zoomByArrange.list).toBe(canvas.effectiveZoom)
  })

  it.each([
    undefined,
    { zoom: 'fit' },
    { zoomByArrange: { grid: 'fit', list: 'fit', matrix: 'fit' } },
    { zoomByArrange: { list: 'invalid' } },
  ])('uses selection fit for fresh and legacy List defaults: %j', (saved) => {
    const storage = createStorage(saved ? { '_histoire-ui-canvas': saved } : undefined)
    const canvas = createCanvasStore({ storage })
    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 'fit', list: 'selection', matrix: 'fit' })
    canvas.setArrangement('list')
    canvas.fit()
    const restored = createCanvasStore({ storage })
    expect(restored.zoomByArrange.list).toBe('fit')
    expect(storage.value('_histoire-ui-canvas')).toMatchObject({ version: 3 })
  })

  it('accepts selection only for List and keeps other saved preferences', () => {
    const canvas = createCanvasStore({ storage: createStorage({
      '_histoire-ui-canvas': { version: 3, zoomByArrange: { grid: 'selection', list: 'selection', matrix: 'selection' }, tool: 'pan', frameBackground: '#abcdef' },
    }) })
    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 'fit', list: 'selection', matrix: 'fit' })
    expect(canvas.tool).toBe('pan')
    expect(canvas.frameBackground).toBe('#abcdef')
  })

  it.each([2, 3])('preserves explicit List canvas Fit from preference version %s', (version) => {
    const storage = createStorage({ '_histoire-ui-canvas': { version, zoomByArrange: { list: 'fit' } } })
    const canvas = createCanvasStore({ storage })
    canvas.setArrangement('list')
    expect(canvas.zoom).toBe('fit')
    canvas.setTool('pan')
    expect(createCanvasStore({ storage }).zoomByArrange.list).toBe('fit')
    expect(storage.value('_histoire-ui-canvas')).toMatchObject({ version: 3 })
  })

  it('keeps Grid and List zoom preferences while resetting Matrix on entry', () => {
    const storage = createStorage()
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoom).toBe('fit')
    canvas.setZoom(0.5)
    canvas.setArrangement('list')
    expect(canvas.zoom).toBe('selection')
    canvas.setZoom(0.75)
    canvas.setArrangement('matrix')
    canvas.setZoom(1)

    canvas.setArrangement('grid')
    expect(canvas.zoom).toBe(0.5)
    canvas.setArrangement('list')
    expect(canvas.zoom).toBe(0.75)
    canvas.fit()
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe('fit')

    const saved = {
      version: 3,
      zoomByArrange: { single: 'fit', grid: 0.5, list: 'fit', matrix: 'fit' },
      tool: 'select',
      frameBackground: 'transparent',
      autoFitContent: false,
    }
    expect(storage.value('_histoire-ui-canvas')).toEqual(saved)

    const restored = createCanvasStore({ storage })
    restored.setArrangement('grid')
    expect(restored.zoom).toBe(0.5)
    restored.setArrangement('list')
    expect(restored.zoom).toBe('fit')
    restored.setArrangement('matrix')
    expect(restored.zoom).toBe('fit')
  })

  it('replaces saved Matrix zoom on entry without fitting outgoing geometry', () => {
    const storage = createStorage({ '_histoire-ui-canvas': { version: 3, zoomByArrange: { grid: 0.5, list: 0.75, matrix: 1.77 } } })
    const canvas = createCanvasStore({ storage })
    canvas.setGeometry({ width: 1000, height: 800 }, { x: 0, y: 0, width: 100, height: 100 })
    const offset = { ...canvas.panOffset }
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe('fit')
    expect(canvas.effectiveZoom).toBe(0.5)
    expect(canvas.panOffset).toEqual(offset)
    expect(storage.value('_histoire-ui-canvas')).toMatchObject({ zoomByArrange: { matrix: 'fit' } })
    canvas.setGeometry({ width: 1000, height: 800 }, { x: 0, y: 0, width: 2000, height: 1000 })
    expect(canvas.effectiveZoom).toBeCloseTo(0.468)
    canvas.setZoom(1.77)
    canvas.setArrangement('matrix')
    canvas.setGeometry({ width: 900, height: 700 }, { x: 0, y: 0, width: 2000, height: 1000 })
    expect(canvas.zoom).toBe(1.77)
    canvas.panBy({ x: 10, y: 20 })
    expect(canvas.zoom).toBe(1.77)
    canvas.setArrangement('grid')
    expect(canvas.zoom).toBe(0.5)
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe('fit')
    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 0.5, list: 0.75, matrix: 'fit' })
  })

  it('reads legacy shared zoom but replaces Matrix preference on entry', () => {
    const storage = createStorage({
      '_histoire-ui-canvas': { zoom: 0.67, tool: 'pan', frameBackground: '#123456' },
    })
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 0.67, list: 0.67, matrix: 0.67 })
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe('fit')
    canvas.setTool('measure')

    expect(storage.value('_histoire-ui-canvas')).toEqual({
      version: 3,
      zoomByArrange: { single: 'fit', grid: 0.67, list: 0.67, matrix: 'fit' },
      tool: 'measure',
      frameBackground: '#123456',
      autoFitContent: false,
    })
  })

  it('repairs malformed slots, clamps numeric values, and preserves other preferences', () => {
    const storage = createStorage({
      '_histoire-ui-canvas': {
        zoom: 0.5,
        zoomByArrange: { grid: -3, list: 'invalid', matrix: 9 },
        tool: 'pan',
        frameBackground: '#abcdef',
      },
    })
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 0.1, list: 0.5, matrix: 4 })
    expect(canvas.tool).toBe('pan')
    expect(canvas.frameBackground).toBe('#abcdef')
  })

  it('switches CanvasViewport through saved zoom slots and fits Matrix on entry', async () => {
    window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoomByArrange: { grid: 0.5, list: 0.75, matrix: 1 } }))
    resizeObserverFixture()
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const matrix = createMatrixStore()
    const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
    const Host = defineComponent({
      setup() {
        provideMatrix(matrix)
        provideStoryCanvasViews(createStoryCanvasViews())
        return () => h(CanvasViewport, { arrange: arrange.value, previewBase: 'https://book.example/', frameBudget: 1 }, {
          matrix: slot => h(MatrixView, { size: slot.size, contentInsets: slot.contentInsets, frameBudget: 1, previewBase: 'https://book.example/' }),
        })
      },
    })
    const wrapper = mount(HistoireProvider, {
      props: { session },
      attachTo: document.body,
      slots: { default: () => h(Host) },
      global: { stubs: { CanvasFrame: true, MatrixCell: true, MatrixAxisBar: true } },
    })
    const canvas = (wrapper.getComponent(CanvasViewport).vm as unknown as { canvas: CanvasStore }).canvas

    try {
      expect(canvas.zoom).toBe(0.5)
      arrange.value = 'list'
      await nextTick()
      await flushPromises()
      expect(canvas.zoom).toBe(0.75)

      matrix.activate('a:b', [{ name: 'enabled', values: [false, true] }, { name: 'active', values: [false, true] }], {})
      arrange.value = 'matrix'
      await nextTick()
      await flushPromises()
      expect(canvas.zoom).toBe('fit')

      arrange.value = 'grid'
      await nextTick()
      expect(canvas.zoom).toBe(0.5)
    }
    finally {
      wrapper.unmount()
      wrapper.element.remove()
      matrix.close()
      await session.dispose()
      window.localStorage.clear()
      vi.unstubAllGlobals()
    }
  })
})
