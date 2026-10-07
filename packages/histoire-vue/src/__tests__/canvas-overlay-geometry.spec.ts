import type { CanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import { layoutCanvasFrames } from '../../../histoire-app/src/app/components/canvas/frame-layout.js'
import MatrixView from '../../../histoire-app/src/app/components/canvas/matrix/MatrixView.vue'
import { canvasToClient } from '../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../../../histoire-app/src/app/stores/story-canvas-views.js'
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
async function canvasFixture(zoom: number | 'fit' = 'fit', initialHeight = 900, customHeader = false, initialArrangement: 'grid' | 'list' = 'grid', initialVariantId: string | null = 'c') {
  window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom }))
  const observers = resizeObserverFixture()
  const geometry = { height: initialHeight, headerHeight: 48, footerHeight: 14 }
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
  await session.selection.select({ storyId: 'a:b', variantId: initialVariantId })
  const matrix = createMatrixStore()
  const arrange = ref<'grid' | 'list' | 'matrix'>(initialArrangement)
  const inspectorWidth = ref(300)
  const Host = defineComponent({
    setup() {
      provideMatrix(matrix)
      provideStoryCanvasViews(createStoryCanvasViews())
      return () => h(CanvasViewport, { arrange: arrange.value, previewBase: 'https://book.example/', frameBudget: 1, inspectorWidth: inspectorWidth.value }, {
        header: customHeader ? () => h('div', 'Custom header') : undefined,
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
  return { wrapper, component, canvas, geometry, observers, fixture, session, matrix, arrange, inspectorWidth, resize }
}

/** Check selection against unobstructed viewport bounds, including fixed-size title. */
function assertSelectionFits(test: Awaited<ReturnType<typeof canvasFixture>>) {
  const snapshot = test.session.getSnapshot()
  const story = snapshot.catalog.stories.find(story => story.id === snapshot.selection?.storyId)!
  const frames = layoutCanvasFrames(story.id, story.variants.map(variant => variant.id), { width: snapshot.settings.responsiveWidth, height: snapshot.settings.responsiveHeight ?? 640 }, 'list', 3, test.canvas.effectiveZoom)
  const frame = frames.find(frame => frame.variantId === snapshot.selection?.variantId)!
  const start = canvasToClient(frame, test.canvas.effectiveZoom, test.canvas.panOffset)
  const end = canvasToClient({ x: frame.x + frame.width, y: frame.y + frame.height }, test.canvas.effectiveZoom, test.canvas.panOffset)
  expect(start.x).toBeGreaterThanOrEqual(31.99)
  expect(start.y).toBeGreaterThanOrEqual((test.canvas.contentInsets.topInset ?? 0) + 31.99)
  expect(end.x).toBeLessThanOrEqual(test.canvas.viewport.width - test.inspectorWidth.value - 31.99)
  expect(end.y).toBeLessThanOrEqual(test.canvas.viewport.height - (test.canvas.contentInsets.bottomInset ?? 0) - 31.99)
  const widthRemaining = test.canvas.viewport.width - test.inspectorWidth.value - 64 - frame.width * test.canvas.effectiveZoom
  const heightRemaining = test.canvas.viewport.height - (test.canvas.contentInsets.topInset ?? 0) - (test.canvas.contentInsets.bottomInset ?? 0) - 64 - frame.height * test.canvas.effectiveZoom
  expect(Math.min(Math.abs(widthRemaining), Math.abs(heightRemaining)), 'selection fills limiting content dimension').toBeLessThan(0.01)
}

describe('canvas overlay geometry', () => {
  it.each(['grid', 'list'] as const)('gives story-only navigation a canonical List fit target from initial %s', async (initialArrangement) => {
    const test = await canvasFixture('fit', 900, false, initialArrangement, null)
    if (initialArrangement === 'grid') {
      expect(test.session.getSnapshot().selection?.variantId).toBeNull()
      test.arrange.value = 'list'
      await flushPromises()
    }
    expect(test.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    expect(test.canvas.zoom).toBe('selection')
    assertSelectionFits(test)
    await test.session.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    expect(test.session.getSnapshot().selection?.variantId).toBe('other')
    assertSelectionFits(test)
  })

  it.each([0.5, 'fit'] as const)('preserves story-only chooser with explicit List zoom %s', async (zoom) => {
    const test = await canvasFixture('fit', 900, false, 'grid', null)
    test.canvas.setArrangement('list')
    if (zoom === 'fit') test.canvas.fit()
    else test.canvas.setZoom(zoom)
    test.arrange.value = 'list'
    await flushPromises()
    expect(test.session.getSnapshot().selection?.variantId).toBeNull()
    expect(test.canvas.zoom).toBe(zoom)
  })

  it('keeps documentation-only targets unselected in List selection mode', async () => {
    const test = await canvasFixture('fit', 900, false, 'list')
    // Legacy docs catalogs can still contain a synthetic variant.
    test.fixture.descriptor.catalog.stories.find(story => story.id === 'docs')!.variants.push({ id: '_default', title: 'Default' })
    test.fixture.emitCatalog()
    await test.session.selection.select({ storyId: 'docs', variantId: null })
    await flushPromises()
    expect(test.session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
    expect(test.canvas.zoom).toBe('selection')
  })

  it('defers initial List selection fit until viewport is measurable', async () => {
    const test = await canvasFixture('fit', 0, false, 'list')
    expect(test.canvas.zoom).toBe('selection')
    expect(test.canvas.effectiveZoom).toBe(1)
    test.geometry.height = 900
    await test.resize()
    assertSelectionFits(test)
  })

  it.each(['grid', 'list'] as const)('fits List selection from initial %s and follows later selection and resize', async (initialArrangement) => {
    const test = await canvasFixture('fit', 900, false, initialArrangement)
    test.arrange.value = 'list'
    await flushPromises()
    expect(test.canvas.zoom).toBe('selection')
    assertSelectionFits(test)
    const firstOffset = { ...test.canvas.panOffset }
    await test.session.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    expect(test.canvas.zoom).toBe('selection')
    expect(test.canvas.panOffset).not.toEqual(firstOffset)
    assertSelectionFits(test)
    const firstZoom = test.canvas.effectiveZoom
    test.geometry.height = 600
    test.geometry.headerHeight = 100
    test.inspectorWidth.value = 600
    await test.resize()
    expect(test.canvas.effectiveZoom).toBeLessThan(firstZoom)
    assertSelectionFits(test)
    await test.session.settings.update({ responsiveWidth: 300, responsiveHeight: 300 })
    await flushPromises()
    expect(test.canvas.effectiveZoom).toBeGreaterThan(firstZoom)
    assertSelectionFits(test)
  })

  it('keeps custom List zoom choices and re-enables selection following explicitly', async () => {
    const test = await canvasFixture('fit', 900, false, 'list')
    test.canvas.setZoom(0.5)
    test.arrange.value = 'grid'
    await flushPromises()
    test.arrange.value = 'list'
    await flushPromises()
    expect(test.canvas.zoom).toBe(0.5)
    test.canvas.fit()
    await test.session.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    expect(test.canvas.zoom).toBe('fit')
    test.canvas.resetZoom()
    await test.resize()
    expect(test.canvas.zoom).toBe('selection')
    assertSelectionFits(test)
  })

  it('measures header metadata and Pan hint in viewport pixels and observes subsequent sizes', async () => {
    const test = await canvasFixture()
    expect(test.component.get('.histoire-canvas-header .histoire-canvas-status').exists()).toBe(true)
    expect(test.component.find('.histoire-canvas-info').exists()).toBe(false)
    expect(test.canvas.contentInsets).toEqual({ topInset: 136, bottomInset: 0 })
    expect(test.canvas.bounds.y).toBe(0)
    const start = canvasToClient(test.canvas.bounds, test.canvas.effectiveZoom, test.canvas.panOffset)
    expect(start.y).toBeGreaterThanOrEqual(168)
    test.geometry.headerHeight = 80
    test.geometry.footerHeight = 40
    await test.resize()
    expect(test.canvas.contentInsets).toEqual({ topInset: 168, bottomInset: 0 })
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

  it('keeps custom header ownership separate from default metadata', async () => {
    const test = await canvasFixture('fit', 900, true)
    expect(test.component.get('.histoire-canvas-header').text()).toBe('Custom header')
    expect(test.component.find('.histoire-canvas-status').exists()).toBe(false)
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
    expect(test.canvas.contentInsets.bottomInset).toBe(0)
    expect(test.canvas.effectiveZoom).toBe(before.zoom)
    expect(test.canvas.panOffset).toEqual(before.offset)
    root.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))
    test.geometry.footerHeight = 14
    await test.resize()
    test.canvas.setTool('pan')
    await nextTick()
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
    expect(test.canvas.contentInsets).toEqual({ topInset: 184, bottomInset: 0 })
    test.geometry.headerHeight = 180
    await test.resize()
    expect(test.canvas.contentInsets).toEqual({ topInset: 268, bottomInset: 0 })
  })
})
