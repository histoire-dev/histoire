import type { CanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CanvasFrame from '../../../histoire-app/src/app/components/canvas/CanvasFrame.vue'
import CanvasMatrixPrimary from '../../../histoire-app/src/app/components/canvas/CanvasMatrixPrimary.vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { canvasRuntimeFixture } from './fixtures/canvas-runtime.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

const replica = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../../histoire-app/src/app/components/canvas/frame-replica.js', () => ({ createCanvasReplicaSession: replica.create }))
let dispose: (() => Promise<void>) | undefined
afterEach(async () => {
  await dispose?.()
  dispose = undefined
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Mount genuine frame lifecycle with existing SDK transport and controlled native geometry. */
async function lifetimeFixture(budget = 2) {
  window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom: 0.5 }))
  resizeObserverFixture()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('histoire-canvas-viewport') ? 1800 : 0
    const height = width ? 1000 : 0
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
  })
  const source = sourceFixture()
  const canonical = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await canonical.connect()
  await canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
  const children: ReturnType<typeof canvasRuntimeFixture>[] = []
  const prepareChild = vi.fn((_child: ReturnType<typeof canvasRuntimeFixture>) => {})
  replica.create.mockImplementation(() => {
    const child = canvasRuntimeFixture()
    prepareChild(child)
    children.push(child)
    return child.session
  })
  const matrix = createMatrixStore()
  const menu = createContextMenu()
  const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
  const Host = defineComponent({
    setup() {
      provideMatrix(matrix)
      provideContextMenu(menu)
      return () => h(CanvasViewport, { arrange: arrange.value, previewBase: 'https://book.example/', frameBudget: budget })
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session: canonical }, attachTo: document.body, slots: { default: () => h(Host) } })
  const viewport = wrapper.getComponent(CanvasViewport)
  const canvas = (viewport.vm as unknown as { canvas: CanvasStore }).canvas
  dispose = async () => {
    wrapper.unmount()
    wrapper.element.remove()
    await flushPromises()
    matrix.close()
    await canonical.dispose()
  }
  await flushPromises()
  return { wrapper, viewport, canvas, canonical, source, children, matrix, arrange, prepareChild }
}

describe('canvas frame runtime lifetime', () => {
  it('keeps predecessor and destination documents across canvas and canonical selection', async () => {
    const test = await lifetimeFixture()
    const frames = test.wrapper.findAllComponents(CanvasFrame)
    const originals = frames.map(frame => frame.get('iframe').element)
    const firstOwner = test.children.find(child => child.session.getSnapshot().selection?.variantId === 'c')!
    const secondOwner = test.children.find(child => child.session.getSnapshot().selection?.variantId === 'other')!
    await frames[1].get('button').trigger('click')
    await flushPromises()
    expect(test.canonical.getSnapshot().selection?.variantId).toBe('other')
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([secondOwner.session])
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
    await flushPromises()
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([firstOwner.session])
    expect(test.wrapper.findAll('iframe').map(frame => frame.element)).toEqual(originals)
    expect(originals.every(frame => frame.isConnected)).toBe(true)
    expect(test.children).toHaveLength(2)
    expect(test.children.every(child => child.source.surfaceClose.mock.calls.length === 0)).toBe(true)
  })

  it('evicts within budget and restores edited state before replacement becomes ready', async () => {
    const test = await lifetimeFixture(1)
    const first = test.children[0]
    await first.session.state.patch({ label: 'Retained edit' })
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    expect(first.source.surfaceClose).toHaveBeenCalledOnce()
    expect(test.wrapper.findAll('iframe')).toHaveLength(1)
    const restored = deferred<void>()
    test.prepareChild.mockImplementationOnce((child) => {
      const dispatch = child.source.request.getMockImplementation()!
      child.source.request.mockImplementation((command, payload) => command === 'state.patch'
        ? restored.promise.then(() => dispatch(command, payload))
        : dispatch(command, payload))
    })
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
    await flushPromises()
    const replacement = test.children.at(-1)!
    expect(replacement.source.request).toHaveBeenCalledWith('state.patch', expect.objectContaining({ label: 'Retained edit' }), expect.anything())
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([undefined])
    restored.resolve()
    await flushPromises()
    expect(replacement.session.getSnapshot().state?.value).toMatchObject({ label: 'Retained edit' })
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([replacement.session])
    expect(test.wrapper.findAll('iframe')).toHaveLength(1)
  })

  it('serializes rapid Matrix primary release and leaves Grid without a hidden duplicate', async () => {
    const test = await lifetimeFixture()
    expect(test.source.adapters.mount).not.toHaveBeenCalled()
    test.matrix.activate('a:b', [{ name: 'enabled', values: [false, true] }, { name: 'active', values: [false, true] }], {})
    test.arrange.value = 'matrix'
    await flushPromises()
    expect(test.source.adapters.mount).toHaveBeenCalledOnce()
    const released = deferred<void>()
    test.source.surfaceClose.mockImplementationOnce(() => released.promise)
    test.arrange.value = 'grid'
    await flushPromises()
    test.arrange.value = 'matrix'
    await flushPromises()
    expect(test.source.adapters.mount).toHaveBeenCalledOnce()
    released.resolve()
    await flushPromises()
    expect(test.source.adapters.mount).toHaveBeenCalledTimes(2)
    expect(test.wrapper.getComponent(CanvasMatrixPrimary).props('active')).toBe(true)
  })
})
