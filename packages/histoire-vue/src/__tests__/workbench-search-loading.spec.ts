import type { HistoireSearchResult } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))

/** Real search controller with a deferred source response and optional loaded prop names. */
async function setup(withProps = false) {
  const fixture = sourceFixture()
  const pending = deferred<HistoireSearchResult[]>()
  const search = vi.fn(() => pending.promise)
  const request = fixture.request.getMockImplementation()!
  fixture.request.mockImplementation(async (command, payload) => {
    if (command === 'catalog.search') return search()
    const result = await request(command, payload)
    if (withProps && command === 'state.get') return { ...result, value: { count: 5, _hPropDefs: [{ name: 'Counter', props: [{ name: 'count', types: ['number'] }] }] } }
    return result
  })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  let runtime: ReturnType<typeof session.mount> | undefined
  if (withProps) {
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    runtime = session.mount(document.createElement('div'), { surface: 'preview' })
    await runtime.ready
    await session.state.get()
  }
  const commands = { list: () => [{ id: 'run', label: 'Run command' }], execute: vi.fn(), context: () => ({}), activateSearch: vi.fn() }
  const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(SearchPanel, { commands }) } })
  return {
    wrapper,
    pending,
    search,
    /** Component and request ownership end together. */
    async close() {
      wrapper.unmount()
      pending.resolve([])
      await runtime?.unmount()
      await session.dispose()
    },
  }
}

describe('workbench search loading', () => {
  it.each(['empty', 'results', 'error'] as const)('preserves input focus while pending search settles to %s', async (outcome) => {
    const test = await setup()
    try {
      const input = test.wrapper.get('input[type="search"]')
      input.element.focus()
      await input.setValue('needle')
      await vi.waitFor(() => expect(test.wrapper.get('[role="status"][aria-atomic="true"]').text()).toBe('Searching…'))
      expect(test.wrapper.text()).not.toContain('No matches')
      expect(document.activeElement).toBe(input.element)
      await vi.waitFor(() => expect(test.search).toHaveBeenCalledOnce())
      if (outcome === 'error') test.pending.reject(new Error('Index unavailable'))
      else test.pending.resolve(outcome === 'results' ? [{ target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'Needle', rank: 0 }] : [])
      await vi.waitFor(() => expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false))
      expect(test.wrapper.text()).toContain(outcome === 'results' ? 'Needle' : 'No matches')
      if (outcome === 'error') expect(test.wrapper.text()).toContain('Search index unavailable')
      expect(document.activeElement).toBe(input.element)
    }
    finally { await test.close() }
  })

  it('keeps loaded prop results and commands usable without a blocking loading state', async () => {
    const test = await setup(true)
    try {
      const input = test.wrapper.get('input[type="search"]')
      await input.setValue('count')
      await vi.waitFor(() => expect(test.wrapper.find('[data-search-kind="prop"]').exists()).toBe(true))
      expect(test.wrapper.get('[aria-label="Search"]').attributes('aria-busy')).toBe('true')
      expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
      await input.setValue('>run')
      await vi.waitFor(() => expect(test.wrapper.text()).toContain('Run command'))
      expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
    }
    finally { await test.close() }
  })
})
