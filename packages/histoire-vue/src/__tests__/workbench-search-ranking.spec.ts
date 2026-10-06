import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { searchEmbedData } from '../../../histoire-app/src/embed/search.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createSearchFixture } from '../../../histoire/src/node/__tests__/utils/search.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))

describe('workbench ranked result activation', () => {
  it.each([false, true])('reconciles later source results with explicit cursor intent %s', async (navigate) => {
    virtualViewport()
    const fixture = sourceFixture()
    const pending = deferred<ReturnType<typeof searchEmbedData>>()
    const request = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => {
      if (command === 'catalog.search') return pending.promise
      if (command === 'state.get') return Promise.resolve({ ...fixture.state(), value: { _hPropDefs: [{ name: 'Disabled', props: [{ name: 'value', types: [] }] }] } })
      return request(command, payload)
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    await session.state.get()
    const activateSearch = vi.fn(async () => {})
    const commands = { list: () => [], execute: async () => {}, context: () => ({}), activateSearch }
    const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(SearchPanel, { commands }) } })
    try {
      const input = wrapper.get('input[type=search]')
      await input.setValue('disabled')
      await vi.waitFor(() => expect(wrapper.get('[data-search-active-result]').text()).toContain('value, prop result'))
      if (navigate) await input.trigger('keydown', { key: 'ArrowDown' })
      pending.resolve([{ target: { storyId: 'docs', variantId: null }, kind: 'docs', title: 'Disabled', rank: 0, match: { mode: 'literal', score: 0 } }])
      await vi.waitFor(() => expect(wrapper.findAll('[data-test-id=search-item]')).toHaveLength(2))
      expect(wrapper.get('[data-search-active-result]').text()).toContain(navigate ? 'value, prop result, 2 of 2' : 'Disabled, documentation result, 1 of 2')
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(activateSearch).toHaveBeenCalledWith(expect.objectContaining(navigate ? { kind: 'variant', title: 'value' } : { kind: 'docs', title: 'Disabled' })))
    }
    finally {
      wrapper.unmount()
      await session.dispose()
      vi.restoreAllMocks()
    }
  })

  it('keeps strongest document first across All and scopes, announces and activates visible order', async () => {
    virtualViewport()
    const fixture = sourceFixture()
    const corpus = createSearchFixture()
    const example = { ...corpus.stories[0], id: 'intro-example', title: 'Introduction examples' }
    fixture.descriptor.catalog.stories = [...corpus.stories, example]
    const data = { ...corpus.data, titles: [...corpus.data.titles, { target: { storyId: example.id, variantId: null }, kind: 'story' as const, title: example.title, text: example.title }] }
    const request = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve(searchEmbedData(data, payload.query)) : request(command, payload))
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const activateSearch = vi.fn(async () => {})
    const commands = { list: () => [], execute: async () => {}, context: () => ({}), activateSearch }
    const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(SearchPanel, { commands }) } })
    try {
      const input = wrapper.get('input[type=search]')
      await input.setValue('introduction')
      await vi.waitFor(() => expect(wrapper.findAll('[data-test-id=search-item]')).toHaveLength(2))
      expect(wrapper.findAll('[data-test-id=search-item]').map(row => row.attributes('data-search-kind'))).toEqual(['docs', 'story'])
      expect(wrapper.get('[data-search-active-result]').text()).toContain('Introduction, documentation result, 1 of 2')
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(activateSearch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'docs', title: 'Introduction' })))
      expect(session.getSnapshot().selection).toEqual({ storyId: corpus.document.id, variantId: null })
      await input.trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.get('[data-search-active-result]').text()).toContain('Introduction examples, story result, 2 of 2')
      await wrapper.get('[aria-label="Search scope"]').findAll('button').find(button => button.text() === 'Docs')!.trigger('click')
      expect(wrapper.findAll('[data-test-id=search-item]').map(row => row.attributes('data-search-kind'))).toEqual(['docs'])
      await wrapper.get('[aria-label="Search scope"]').findAll('button').find(button => button.text() === 'All')!.trigger('click')
      expect(wrapper.findAll('[data-test-id=search-item]').map(row => row.attributes('data-search-kind'))).toEqual(['docs', 'story'])
    }
    finally {
      wrapper.unmount()
      await session.dispose()
      vi.restoreAllMocks()
    }
  })
})
