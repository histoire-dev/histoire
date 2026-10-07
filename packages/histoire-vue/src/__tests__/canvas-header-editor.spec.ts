import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../../../histoire-app/src/app/stores/story-canvas-views.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

const filePath = 'src/components/CodeGen.story.vue'
let dispose: (() => Promise<void>) | undefined

afterEach(async () => {
  await dispose?.()
  dispose = undefined
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Mount canvas header with a connected canonical source and controlled geometry. */
async function editorFixture(options: { available?: boolean, target?: { storyId: string, variantId: string | null } } = {}) {
  resizeObserverFixture()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('histoire-canvas-viewport') ? 1800 : 0
    const height = width ? 1000 : 0
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
  })
  const source = sourceFixture()
  const target = options.target ?? { storyId: 'a:b', variantId: 'c' }
  source.descriptor.capabilities.openInEditor = { available: options.available ?? true }
  source.descriptor.catalog.stories = source.descriptor.catalog.stories.map(story => story.id === target.storyId ? { ...story, relativePath: filePath } : story)
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  await session.selection.select(target)
  source.request.mockResolvedValue(null)
  const matrix = createMatrixStore()
  const contextMenu = createContextMenu()
  const Host = defineComponent({
    setup() {
      provideStoryCanvasViews(createStoryCanvasViews())
      provideMatrix(matrix)
      provideContextMenu(contextMenu)
      return () => h(CanvasViewport, { arrange: 'grid', previewBase: 'https://book.example/', frameBudget: 1 })
    },
  })
  const wrapper = mount(HistoireProvider, {
    props: { session },
    attachTo: document.body,
    slots: { default: () => h(Host) },
    global: { stubs: { CanvasFrame: true, CanvasMatrixPrimary: true } },
  })
  const viewport = wrapper.getComponent(CanvasViewport)
  dispose = async () => {
    wrapper.unmount()
    wrapper.element.remove()
    matrix.close()
    await session.dispose()
  }
  await flushPromises()
  return { wrapper, viewport, session, source }
}

/** Resolve file button by its accessible name. */
function fileButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.get<HTMLButtonElement>(`button[aria-label="Open ${filePath} in editor"]`)
}

describe('canvas header editor action', () => {
  it('opens current canonical story target through native button', async () => {
    const test = await editorFixture()
    const button = fileButton(test.wrapper)

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.element.type).toBe('button')
    expect(button.attributes('title')).toBe(`Open ${filePath} in editor`)
    await button.trigger('click')
    await flushPromises()

    expect(test.source.request).toHaveBeenCalledWith('openInEditor', { storyId: 'a:b', variantId: 'c' }, expect.objectContaining({ sourceId: 'book', epoch: 'epoch-1', revision: 'revision-1' }))
    expect(test.source.request.mock.calls.filter(([command]) => command === 'openInEditor')).toHaveLength(1)
  })

  it('preserves explicit null variant for docs-only stories', async () => {
    const target = { storyId: 'docs', variantId: null }
    const test = await editorFixture({ target })

    await fileButton(test.wrapper).trigger('click')
    await flushPromises()

    expect(test.source.request).toHaveBeenCalledWith('openInEditor', target, expect.anything())
  })

  it('keeps filename passive when editor capability is unavailable', async () => {
    const test = await editorFixture({ available: false })

    expect(test.wrapper.text()).toContain(filePath)
    expect(test.wrapper.find(`button[aria-label="Open ${filePath} in editor"]`).exists()).toBe(false)
    expect(test.source.request).not.toHaveBeenCalledWith('openInEditor', expect.anything(), expect.anything())
  })

  it('keeps filename passive when snapshot becomes stale', async () => {
    const test = await editorFixture()
    test.source.emitDisconnect()
    await flushPromises()

    expect(test.wrapper.text()).toContain(filePath)
    expect(test.wrapper.find(`button[aria-label="Open ${filePath} in editor"]`).exists()).toBe(false)
    expect(test.source.request).not.toHaveBeenCalledWith('openInEditor', expect.anything(), expect.anything())
  })

  it('keeps cached collection-error filename passive', async () => {
    const test = await editorFixture()
    const catalog = test.source.descriptor.catalog
    test.source.descriptor.catalog = {
      ...catalog,
      stories: catalog.stories.filter(story => story.id !== 'a:b'),
      tree: [],
      diagnostics: [{ code: 'COLLECTION_FAILED', message: 'Collection failed', severity: 'error', storyId: 'a:b', relativePath: filePath }],
    }
    test.source.emitCatalog()
    await flushPromises()

    expect(test.wrapper.text()).toContain(filePath)
    expect(test.wrapper.find(`button[aria-label="Open ${filePath} in editor"]`).exists()).toBe(false)
    expect(test.source.request).not.toHaveBeenCalledWith('openInEditor', expect.anything(), expect.anything())
  })

  it('reports active request failures through canvas error event', async () => {
    const test = await editorFixture()
    const failure = new Error('Editor request failed')
    test.source.request.mockRejectedValueOnce(failure)

    await fileButton(test.wrapper).trigger('click')
    await flushPromises()

    expect(test.viewport.emitted('error')).toEqual([[failure]])
  })

  it.each(['selection', 'source epoch', 'source revision'] as const)('suppresses request failure after %s changes', async (change) => {
    const test = await editorFixture()
    const pending = deferred<null>()
    const dispatch = test.source.request.getMockImplementation()!
    test.source.request.mockImplementation((...args) => args[0] === 'openInEditor' ? pending.promise : dispatch(...args))
    await fileButton(test.wrapper).trigger('click')

    if (change === 'selection') {
      await test.session.selection.select({ storyId: 'a:b', variantId: 'other' })
    }
    else if (change === 'source epoch') {
      test.source.descriptor.epoch = 'epoch-2'
      test.source.emitCatalog()
      await flushPromises()
    }
    else {
      test.source.descriptor.revision = 'revision-2'
      test.source.emitCatalog()
      await flushPromises()
    }
    pending.reject(new Error('Stale editor request'))
    await flushPromises()

    expect(test.viewport.emitted('error')).toBeUndefined()
  })
})
