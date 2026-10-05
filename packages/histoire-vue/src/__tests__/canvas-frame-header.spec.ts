import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import CanvasFrame from '../../../histoire-app/src/app/components/canvas/CanvasFrame.vue'
import CanvasReplicaPreview from '../../../histoire-app/src/app/components/canvas/CanvasReplicaPreview.vue'
import { layoutCanvasFrames } from '../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

let dispose: (() => Promise<void>) | undefined

afterEach(async () => {
  await dispose?.()
  dispose = undefined
})

/** Mount real frame chrome and providers; only passive preview readiness is controlled. */
async function frameFixture(selected = false) {
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  const canvas = createCanvasStore()
  const frames = createCanvasFrames(canvas)
  const menu = createContextMenu()
  const story = source.descriptor.catalog.stories[0]
  const variant = story.variants[0]
  const frame = layoutCanvasFrames(story.id, [variant.id], { width: 208, height: 180 }, 'grid')[0]
  const props = reactive({ frame, variant, selected, live: true, retainReplica: false, stale: false, previewBase: 'https://book.example/', width: 208, height: 180 })
  const Host = defineComponent({
    setup() {
      provideCanvas(canvas, frames)
      provideContextMenu(menu)
      return () => h(CanvasFrame, props)
    },
  })
  const wrapper = mount(HistoireProvider, {
    props: { session },
    attachTo: document.body,
    slots: { default: () => h(Host) },
    global: { stubs: { CanvasReplicaPreview: true } },
  })
  dispose = async () => {
    wrapper.unmount()
    wrapper.element.remove()
    await session.dispose()
  }
  const component = wrapper.getComponent(CanvasFrame)
  const header = component.get<HTMLButtonElement>('button')
  return { component, header, props, menu,
    /** Publish runtime readiness through the same event as the passive preview. */
    async ready() {
      component.getComponent(CanvasReplicaPreview).vm.$emit('status', 'ready')
      await nextTick()
    } }
}

describe('canvas frame header interaction', () => {
  it('promotes exact ready live replica', async () => {
    const test = await frameFixture()
    await test.ready()
    test.header.element.click()
    expect(test.component.emitted('promote')).toEqual([[test.props.frame.id]])
    expect(test.component.emitted('select')).toBeUndefined()
    expect(test.header.attributes('aria-pressed')).toBe('false')
  })

  it('leaves ready passive preview unobstructed for direct iframe interaction', async () => {
    const test = await frameFixture()
    await test.ready()
    expect(test.component.find('.histoire-frame-select').exists()).toBe(false)
  })

  it('retains promoted replica when frame becomes selected', async () => {
    const test = await frameFixture()
    await test.ready()
    test.props.selected = true
    test.props.retainReplica = true
    await nextTick()
    expect(test.component.findComponent(CanvasReplicaPreview).exists()).toBe(true)
  })

  it.each(['loading', 'budget-excluded'] as const)('selects %s passive preview through its title', async (state) => {
    const test = await frameFixture()
    if (state === 'budget-excluded') test.props.live = false
    await nextTick()
    expect(test.header.element.disabled).toBe(false)
    test.header.element.click()
    expect(test.component.emitted('select')).toEqual([[test.props.variant.id]])
  })

  it('selects budget-excluded placeholder through its body', async () => {
    const test = await frameFixture()
    test.props.live = false
    await nextTick()
    await test.component.get('[data-test-id="responsive-preview-bg"]').trigger('click')
    expect(test.component.emitted('select')).toEqual([[test.props.variant.id]])
  })

  it('selects failed passive preview through its title', async () => {
    const test = await frameFixture()
    test.component.getComponent(CanvasReplicaPreview).vm.$emit('status', 'error', new Error('preview failed'))
    await nextTick()
    expect(test.header.element.disabled).toBe(false)
    test.header.element.click()
    expect(test.component.emitted('select')).toEqual([[test.props.variant.id]])
  })

  it.each([false, true])('keeps stale selected=%s frame inactive', async (selected) => {
    const test = await frameFixture(selected)
    test.props.stale = true
    test.props.live = false
    await nextTick()
    expect(test.header.attributes('aria-pressed')).toBe(String(selected))
    expect(test.header.element.disabled).toBe(true)
    test.header.element.click()
    expect(test.component.emitted('select')).toBeUndefined()
  })

  it.each([
    { key: 'ContextMenu', shiftKey: false },
    { key: 'F10', shiftKey: true },
  ])('captures exact menu target on $key and restores header focus', async (keys) => {
    const test = await frameFixture()
    await test.ready()
    test.header.element.focus()
    await test.header.trigger('keydown', keys)
    expect(test.menu.state.target).toEqual({ storyId: test.props.frame.storyId, variantId: test.props.variant.id, frameKey: test.props.frame.id })
    expect(test.component.emitted('select')).toBeUndefined()
    test.header.element.blur()
    test.menu.close(true)
    expect(test.menu.state.target).toBeNull()
    expect(document.activeElement).toBe(test.header.element)
  })
})
