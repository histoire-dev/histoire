import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireEvents } from '../components/events/HistoireEvents.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

/** Keep session and mounted panel real; fixture supplies source and iframe transport. */
async function eventsPanel() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const preview = session.mount(document.createElement('div'), { surface: 'preview' })
  await preview.ready
  const inlineDetails = ref(true)
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireEvents, { inlineDetails: inlineDetails.value }) }, attachTo: document.body })
  const element = wrapper.element
  return {
    fixture,
    session,
    inlineDetails,
    wrapper,
    /** Retain root before unmount; test-utils falls back to parent after retirement. */
    async dispose() {
      if (wrapper.exists()) wrapper.unmount()
      element.remove()
      await session.dispose()
    },
  }
}

describe('native inline inspector events', () => {
  it('shows cleaned current-target payloads with timestamp and clears history explicitly', async () => {
    const { fixture, session, inlineDetails, wrapper, dispose } = await eventsPanel()
    try {
      fixture.emitEvent(1)
      await nextTick()
      expect(wrapper.get('[data-test-id="event-item"] pre').text()).toBe('{\n  "count": 1\n}')
      // Payload is already readable; clicking its heading must not open another overlay.
      expect(wrapper.find('[data-test-id="event-item"] button').exists()).toBe(false)
      await wrapper.get('[data-test-id="event-item"]').trigger('click')
      expect(wrapper.findAll('[data-test-id="event-item"] pre')).toHaveLength(1)
      expect(wrapper.get('time').attributes('datetime')).toBe(new Date(1).toISOString())
      expect(wrapper.get('.histoire-events-count').text()).toBe('1 events · newest first')
      // Embedders without inline details still open their payload through the event button.
      inlineDetails.value = false
      await nextTick()
      await wrapper.get('[data-test-id="event-item"] button').trigger('click')
      await vi.waitFor(() => expect(wrapper.get('[data-histoire-overlay] pre').text()).toBe('{\n  "count": 1\n}'))
      inlineDetails.value = true
      await nextTick()
      fixture.emitEvent(2)
      await nextTick()
      expect(wrapper.findAll('[data-test-id="event-item"] pre').map(item => JSON.parse(item.text()).count)).toEqual([2, 1])
      await session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await nextTick()
      expect(wrapper.find('[data-test-id="event-item"]').exists()).toBe(false)
      fixture.emitEvent(3)
      await nextTick()
      expect(wrapper.findAll('[data-test-id="event-item"]')).toHaveLength(1)
      await wrapper.get('.histoire-events > button').trigger('click')
      expect(session.getSnapshot().events.items).toHaveLength(0)
      expect(wrapper.find('[data-test-id="event-item"]').exists()).toBe(false)
    }
    finally {
      await dispose()
    }
  })

  it.each(['clear', 'selection', 'runtime', 'mode', 'unmount'] as const)('retires deferred following after %s', async (action) => {
    const { fixture, session, inlineDetails, wrapper, dispose } = await eventsPanel()
    try {
      fixture.emitEvent(1)
      await nextTick()
      await nextTick()
      const viewport = wrapper.get<HTMLElement>('.histoire-events .vue-recycle-scroller').element
      viewport.scrollTop = 79
      fixture.emitEvent(2)
      // Observe actual Vue publication before pending nextTick scroll resumes.
      await nextTick()
      let selection: Promise<unknown> | undefined
      if (action === 'clear') session.events.clear()
      else if (action === 'selection') selection = session.selection.select({ storyId: 'a', variantId: 'b:c' })
      else if (action === 'runtime') fixture.reload()
      else if (action === 'mode') inlineDetails.value = false
      else wrapper.unmount()
      await nextTick()
      await selection
      // Measured scroller may retain its anchor; cancellation must never force top.
      expect(viewport.scrollTop).toBeGreaterThan(0)
      if (action === 'clear') expect(wrapper.find('[data-test-id="event-item"]').exists()).toBe(false)
    }
    finally {
      await dispose()
    }
  })

  it('follows new inline events without following state publications or oldest-first events', async () => {
    const { fixture, session, inlineDetails, wrapper, dispose } = await eventsPanel()
    try {
      fixture.emitEvent(1)
      await nextTick()
      await nextTick()
      const viewport = wrapper.get<HTMLElement>('.histoire-events .vue-recycle-scroller').element
      viewport.scrollTop = 79
      await session.state.patch({ count: 7 })
      await nextTick()
      expect(viewport.scrollTop).toBe(79)
      const clear = wrapper.get<HTMLButtonElement>('.histoire-events > button').element
      clear.focus()
      fixture.emitEvent(2)
      await nextTick()
      await nextTick()
      expect(viewport.scrollTop).toBe(0)
      expect(document.activeElement).toBe(clear)
      viewport.scrollTop = 79
      inlineDetails.value = false
      await nextTick()
      viewport.scrollTop = 79
      fixture.emitEvent(3)
      await nextTick()
      await nextTick()
      expect(viewport.scrollTop).toBe(79)
      expect(wrapper.findAll('[data-test-id="event-item"]')).toHaveLength(3)
    }
    finally {
      await dispose()
    }
  })
})
