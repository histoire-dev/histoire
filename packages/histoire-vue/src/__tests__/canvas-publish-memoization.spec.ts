import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import AgentCursor from '../../../histoire-app/src/app/components/canvas/AgentCursor.vue'
import CanvasViewport from '../../../histoire-app/src/app/components/canvas/CanvasViewport.vue'
import FrameGrid from '../../../histoire-app/src/app/components/canvas/FrameGrid.vue'
import { createCanvasFrames, provideCanvas } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { createMcpStore, provideMcpStore } from '../../../histoire-app/src/app/stores/mcp.js'
import { createStoryCanvasViews, provideStoryCanvasViews } from '../../../histoire-app/src/app/stores/story-canvas-views.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

/** Canvas reads its provider from the package entry, like the production workbench. */
describe('canvas publication memoization', () => {
  it('keeps canvas frame layouts when unrelated snapshot fields change', async () => {
    resizeObserverFixture()
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const Host = defineComponent({
      setup() {
        provideStoryCanvasViews(createStoryCanvasViews())
        return () => h(CanvasViewport, { arrange: 'grid', previewBase: 'https://book.example/', frameBudget: 1 })
      },
    })
    const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) }, global: { stubs: { CanvasFrame: true } } })
    try {
      await nextTick()
      const frames = wrapper.getComponent(FrameGrid).props('frames')
      expect(frames.length).toBeGreaterThan(0)
      // Settings-only publication keeps catalog and selection identity.
      await session.settings.update({ checkerboard: !session.getSnapshot().settings.checkerboard })
      await nextTick()
      expect(wrapper.getComponent(FrameGrid).props('frames')).toBe(frames)
    }
    finally {
      wrapper.unmount()
      wrapper.element.remove()
      await session.dispose()
      window.localStorage.clear()
    }
  })

  it('skips agent cursor geometry reads while no agent operation is active', async () => {
    resizeObserverFixture()
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const canvas = createCanvasStore()
    const Host = defineComponent({
      setup() {
        provideCanvas(canvas, createCanvasFrames(canvas))
        provideMcpStore(createMcpStore())
        return () => h(AgentCursor)
      },
    })
    const layerReads = vi.fn()
    const native = HTMLElement.prototype.getBoundingClientRect
    // Provider measures its own root; only the cursor layer's reads matter here.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('histoire-agent-cursor-layer')) layerReads()
      return native.call(this)
    })
    const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
    try {
      canvas.panOffset = { x: 20, y: 40 }
      window.dispatchEvent(new Event('scroll'))
      await nextTick()
      expect(layerReads).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      wrapper.element.remove()
      vi.restoreAllMocks()
      await session.dispose()
    }
  })
})
