import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireEvents } from '../components/events/HistoireEvents.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('native inline inspector events', () => {
  it('shows cleaned current-target payloads with timestamp and clears history explicitly', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const preview = session.mount(document.createElement('div'), { surface: 'preview' })
    await preview.ready
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireEvents, { inlineDetails: true }) } })
    fixture.emitEvent(1)
    await nextTick()
    expect(wrapper.get('[data-test-id="event-item"] pre').text()).toBe('{\n  "count": 1\n}')
    expect(wrapper.get('time').attributes('datetime')).toBe(new Date(1).toISOString())
    expect(wrapper.get('.histoire-events-count').text()).toBe('1 events · newest first')
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
    wrapper.unmount()
    await session.dispose()
  })
})
