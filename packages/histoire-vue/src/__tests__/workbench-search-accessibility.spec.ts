import type { HistoireSearchResult } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))
afterEach(() => vi.restoreAllMocks())

/** Production search rows prove keyboard cursor, canonical selection, and commands stay distinct. */
async function search() {
  const fixture = sourceFixture()
  const prototype = fixture.descriptor.catalog.stories[0]
  fixture.descriptor.catalog.stories.push(...Array.from({ length: 260 }, (_, index) => ({ ...prototype, id: `distant-${index}`, title: `Distant ${index}`, variants: [{ id: 'default', title: 'Default' }] })))
  fixture.descriptor.catalog.tree.push(...fixture.descriptor.catalog.stories.slice(-260).map(story => ({ kind: 'story' as const, storyId: story.id, title: story.title })))
  const results: HistoireSearchResult[] = [
    { target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'Needle current', rank: 0 },
    { target: { storyId: 'docs', variantId: null }, kind: 'docs', title: 'Needle documentation', rank: 1 },
  ]
  const distant = Array.from({ length: 260 }, (_, index) => ({ target: { storyId: `distant-${index}`, variantId: 'default' }, kind: 'variant' as const, title: `Needle distant ${index}`, rank: index }))
  const request = fixture.request.getMockImplementation()!
  fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve(payload.query.includes('distant') ? distant : results) : request(command, payload))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const execute = vi.fn(async () => {})
  const commands = {
    list: () => [{ id: 'run', label: 'Run command' }],
    execute,
    context: () => ({}),
    activateSearch: async () => {},
  }
  const selected = vi.fn()
  const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(SearchPanel, { commands, onSelect: selected }) } })
  return {
    wrapper,
    session,
    execute,
    selected,
    async close() {
      wrapper.unmount()
      await session.dispose()
    },
  }
}

describe('production workbench search cursor accessibility', () => {
  it('announces keyboard variants, docs, commands, and distant virtual results without changing canonical current', async () => {
    virtualViewport()
    const owner = await search()
    try {
      const input = owner.wrapper.get('input[type=search]')
      await input.setValue('needle')
      await vi.waitFor(() => expect(owner.wrapper.findAll('[data-test-id=search-item]').length).toBeGreaterThan(1))
      input.element.focus()
      await input.trigger('keydown', { key: 'ArrowDown' })
      await vi.waitFor(() => expect(owner.wrapper.get('[role=status][data-search-active-result]').text()).toContain('Needle documentation'))
      expect(input.attributes('aria-describedby')).toBe('histoire-search-active-result')
      expect(owner.wrapper.get('[data-search-kind=docs]').attributes('id')).toBeTruthy()
      expect(owner.wrapper.get('[aria-current=true]').text()).toContain('Needle current')
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(owner.selected).toHaveBeenCalledWith(expect.objectContaining({ title: 'Needle documentation' })))

      await input.setValue('needle distant')
      await vi.waitFor(() => expect(owner.wrapper.findAll('[data-test-id=search-item]').length).toBeGreaterThan(1))
      for (let index = 0; index < 200; index++) await input.trigger('keydown', { key: 'ArrowDown' })
      await vi.waitFor(() => expect(owner.wrapper.get('[role=status][data-search-active-result]').text()).toContain('Needle distant 200'))
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'distant-200', variantId: 'default' }))

      await input.setValue('>run')
      await vi.waitFor(() => expect(owner.wrapper.get('[data-search-kind=command]').text()).toContain('Run command'))
      await vi.waitFor(() => expect(owner.wrapper.get('[role=status][data-search-active-result]').text()).toContain('Run command'))
      expect(input.attributes('aria-describedby')).toBe('histoire-search-active-result')
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(owner.execute).toHaveBeenCalledOnce())
    }
    finally { await owner.close() }
  })
})
