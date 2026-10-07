import type { CanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { onTestFinished, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CanvasViewport from '../../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import { createContextMenu, provideContextMenu } from '../../../../histoire-app/src/app/composables/context-menu.js'
import { createMatrixStore, provideMatrix } from '../../../../histoire-app/src/app/stores/matrix.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../../../../histoire-app/src/app/stores/story-canvas-views.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { canvasRuntimeFixture } from './canvas-runtime.js'
import { resizeObserverFixture } from './resize-observer.js'

/** Mount genuine frame lifecycle with existing SDK transport and controlled native geometry. */
export async function canvasLifetimeFixture(create: ReturnType<typeof vi.fn>, budget = 2, variantCount = 2, zoom = 0.5, responsiveDisabled = false) {
  window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom }))
  const resize = resizeObserverFixture()
  const dimensions = { width: 1800, height: 1000 }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('histoire-canvas-viewport') ? dimensions.width : 0
    const height = width ? dimensions.height : 0
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
  })
  const source = sourceFixture()
  source.descriptor.catalog.stories[0].variants[0].responsiveDisabled = responsiveDisabled
  if (variantCount > 2) {
    source.descriptor.catalog.stories[0].variants = Array.from({ length: variantCount }, (_, index) => ({
      id: index === 0 ? 'c' : `variant-${index}`,
      title: `Variant ${index}`,
    }))
  }
  const canonical = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await canonical.connect()
  await canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
  const children: ReturnType<typeof canvasRuntimeFixture>[] = []
  const prepareChild = vi.fn((_child: ReturnType<typeof canvasRuntimeFixture>) => {})
  create.mockImplementation(() => {
    const child = canvasRuntimeFixture()
    prepareChild(child)
    children.push(child)
    return child.session
  })
  const matrix = createMatrixStore()
  const menu = createContextMenu()
  const arrange = ref<'single' | 'grid' | 'list' | 'matrix'>('grid')
  const uiHidden = ref(false)
  const Host = defineComponent({
    setup() {
      provideStoryCanvasViews(createStoryCanvasViews())
      provideMatrix(matrix)
      provideContextMenu(menu)
      return () => h(CanvasViewport, { arrange: arrange.value, previewBase: 'https://book.example/', frameBudget: budget, uiHidden: uiHidden.value })
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session: canonical }, attachTo: document.body, slots: { default: () => h(Host) } })
  const viewport = wrapper.getComponent(CanvasViewport)
  const canvas = (viewport.vm as unknown as { canvas: CanvasStore }).canvas
  onTestFinished(async () => {
    wrapper.unmount()
    wrapper.element.remove()
    await flushPromises()
    matrix.close()
    await canonical.dispose()
  })
  await flushPromises()
  return { wrapper, viewport, resize, dimensions, canvas, canonical, source, children, matrix, arrange, prepareChild, uiHidden }
}
