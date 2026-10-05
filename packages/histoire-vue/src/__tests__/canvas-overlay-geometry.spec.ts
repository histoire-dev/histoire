import type { CanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import MatrixView from '../../../histoire-app/src/app/components/canvas/matrix/MatrixView.vue'
import { canvasToClient } from '../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

let dispose: (() => Promise<void>) | undefined

afterEach(async () => {
  await dispose?.()
  dispose = undefined
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Mount genuine canvas geometry; preview lifetimes do not participate in layout. */
async function canvasFixture(zoom: number | 'fit' = 'fit', initialHeight = 900) {
  window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom }))
  const observers = resizeObserverFixture()
  const geometry = { height: initialHeight, headerHeight: 30, footerHeight: 14 }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains('histoire-canvas-viewport')
      ? geometry.height
      : this.classList.contains('histoire-canvas-header')
        ? geometry.headerHeight
        : this.classList.contains('histoire-canvas-info') ? geometry.footerHeight : 36
    const top = this.classList.contains('histoire-canvas-header')
      ? 98
      : this.classList.contains('histoire-canvas-info')
        ? 10 + geometry.height - 20 - height
        : this.classList.contains('histoire-canvas-toolbar-host') ? 26 : 10
    return { x: 100, y: top, left: 100, top, right: 1300, bottom: top + height, width: 1200, height, toJSON: () => ({}) }
  })
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const matrix = createMatrixStore()
  const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
  const Host = defineComponent({
    setup() {
      provideMatrix(matrix)
      return () => h(CanvasViewport, { arrange: arrange.value, previewBase: 'https://book.example/', frameBudget: 1, inspectorWidth: 300 }, {
        header: () => h('div', 'Custom header'),
        matrix: slot => h(MatrixView, { size: slot.size, contentInsets: slot.contentInsets, frameBudget: 1, previewBase: 'https://book.example/' }),
      })
    },
  })
  const wrapper = mount(HistoireProvider, {
    props: { session },
    attachTo: document.body,
    slots: { default: () => h(Host) },
    global: { stubs: { HistoirePreview: true, CanvasFrame: true, MatrixCell: true, MatrixAxisBar: true } },
  })
  const component = wrapper.getComponent(CanvasViewport)
  const canvas = (component.vm as unknown as { canvas: CanvasStore }).canvas
  dispose = async () => {
    wrapper.unmount()
    wrapper.element.remove()
    matrix.close()
    await session.dispose()
  }
  await flushPromises()
  /** Native observer delivery and Vue feedback settle fixed-pixel frame layout. */
  async function resize() {
    observers.deliver()
    await flushPromises()
  }
  return { wrapper, component, canvas, geometry, observers, fixture, session, matrix, arrange, resize }
}

describe('canvas overlay geometry', () => {
  it('measures custom header and footer in viewport pixels and observes subsequent sizes', async () => {
    const test = await canvasFixture()
    expect(test.canvas.contentInsets).toEqual({ topInset: 118, bottomInset: 34 })
    expect(test.canvas.bounds.y).toBe(0)
    const start = canvasToClient(test.canvas.bounds, test.canvas.effectiveZoom, test.canvas.panOffset)
    expect(start.y).toBeGreaterThanOrEqual(150)
    test.geometry.headerHeight = 80
    test.geometry.footerHeight = 40
    await test.resize()
    expect(test.canvas.contentInsets).toEqual({ topInset: 168, bottomInset: 60 })
    expect(test.observers.targets().has(test.component.get('.histoire-canvas-header').element)).toBe(true)
    const stories = test.fixture.descriptor.catalog.stories
    const oldHeader = test.component.get('.histoire-canvas-header').element
    test.fixture.descriptor.catalog.stories = []
    test.fixture.emitCatalog()
    await flushPromises()
    expect(test.observers.targets().has(oldHeader)).toBe(false)
    test.fixture.descriptor.catalog.stories = stories
    test.fixture.emitCatalog()
    await test.session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await flushPromises()
    expect(test.observers.targets().has(test.component.get('.histoire-canvas-header').element)).toBe(true)
    await dispose?.()
    dispose = undefined
    expect(test.observers.count()).toBe(0)
  })

  it('reveals saved numeric selection after an initially zero-height viewport is measured', async () => {
    const test = await canvasFixture(0.67, 0)
    test.canvas.panOffset = { x: -5000, y: -5000 }
    test.geometry.height = 900
    await test.resize()
    expect(test.canvas.zoom).toBe(0.67)
    const start = canvasToClient({ x: 0, y: 0 }, test.canvas.effectiveZoom, test.canvas.panOffset)
    expect(start.x).toBeGreaterThanOrEqual(24)
    expect(start.y).toBeGreaterThanOrEqual(142)
  })

  it('ignores temporary pan footer changes while still measuring persistent Pan tool', async () => {
    const test = await canvasFixture()
    const before = { zoom: test.canvas.effectiveZoom, offset: { ...test.canvas.panOffset } }
    const root = test.component.element as HTMLElement
    root.focus()
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
    await nextTick()
    test.geometry.footerHeight = 80
    await test.resize()
    expect(test.canvas.contentInsets.bottomInset).toBe(34)
    expect(test.canvas.effectiveZoom).toBe(before.zoom)
    expect(test.canvas.panOffset).toEqual(before.offset)
    root.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))
    test.geometry.footerHeight = 14
    await test.resize()
    test.canvas.setTool('pan')
    test.geometry.footerHeight = 40
    await test.resize()
    expect(test.canvas.contentInsets.bottomInset).toBe(60)
  })

  it('passes footer reservation to Matrix without counting its top controls twice', async () => {
    const test = await canvasFixture()
    test.matrix.activate('a:b', [{ name: 'enabled', values: [false, true] }, { name: 'active', values: [false, true] }], {})
    test.arrange.value = 'matrix'
    await nextTick()
    await test.resize()
    expect(test.canvas.contentInsets).toEqual({ topInset: 184, bottomInset: 34 })
    test.geometry.headerHeight = 180
    await test.resize()
    expect(test.canvas.contentInsets).toEqual({ topInset: 268, bottomInset: 34 })
  })
})
