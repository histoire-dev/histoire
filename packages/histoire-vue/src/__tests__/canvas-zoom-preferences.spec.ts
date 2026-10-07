import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import MatrixView from '../../../histoire-app/src/app/components/canvas/matrix/MatrixView.vue'
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
  it('keeps independent persistent zoom slots for Grid, List, and Matrix', () => {
    const storage = createStorage()
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoom).toBe('fit')
    canvas.setZoom(0.5)
    canvas.setArrangement('list')
    expect(canvas.zoom).toBe('fit')
    canvas.setZoom(0.75)
    canvas.setArrangement('matrix')
    canvas.setZoom(1)

    canvas.setArrangement('grid')
    expect(canvas.zoom).toBe(0.5)
    canvas.setArrangement('list')
    expect(canvas.zoom).toBe(0.75)
    canvas.fit()
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe(1)

    const saved = {
      version: 3,
      zoomByArrange: { single: 'fit', grid: 0.5, list: 'fit', matrix: 1 },
      tool: 'select',
      frameBackground: 'transparent',
    }
    expect(storage.value('_histoire-ui-canvas')).toEqual(saved)

    const restored = createCanvasStore({ storage })
    restored.setArrangement('grid')
    expect(restored.zoom).toBe(0.5)
    restored.setArrangement('list')
    expect(restored.zoom).toBe('fit')
    restored.setArrangement('matrix')
    expect(restored.zoom).toBe(1)
  })

  it('migrates a legacy zoom into every arrangement slot', () => {
    const storage = createStorage({
      '_histoire-ui-canvas': { zoom: 0.67, tool: 'pan', frameBackground: '#123456' },
    })
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 0.67, list: 0.67, matrix: 0.67 })
    canvas.setArrangement('matrix')
    expect(canvas.zoom).toBe(0.67)
    canvas.setTool('measure')

    expect(storage.value('_histoire-ui-canvas')).toEqual({
      version: 3,
      zoomByArrange: { single: 'fit', grid: 0.67, list: 0.67, matrix: 0.67 },
      tool: 'measure',
      frameBackground: '#123456',
    })
  })

  it('repairs malformed slots, clamps numeric values, and preserves other preferences', () => {
    const storage = createStorage({
      '_histoire-ui-canvas': {
        zoom: 0.5,
        zoomByArrange: { single: 'fit', grid: -3, list: 'invalid', matrix: 9 },
        tool: 'pan',
        frameBackground: '#abcdef',
      },
    })
    const canvas = createCanvasStore({ storage })

    expect(canvas.zoomByArrange).toEqual({ single: 'fit', grid: 0.1, list: 0.5, matrix: 4 })
    expect(canvas.tool).toBe('pan')
    expect(canvas.frameBackground).toBe('#abcdef')
  })

  it('switches CanvasViewport through saved Grid, List, and Matrix zoom slots', async () => {
    window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoomByArrange: { single: 'fit', grid: 0.5, list: 0.75, matrix: 1 } }))
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
      expect(canvas.zoom).toBe(1)

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
