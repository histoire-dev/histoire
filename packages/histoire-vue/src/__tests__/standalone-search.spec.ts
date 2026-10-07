import type { ClientCommandContext } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
beforeEach(() => virtualViewport())
afterEach(() => vi.restoreAllMocks())

const callbacks = vi.hoisted(() => ({ first: vi.fn(), intended: vi.fn(), last: vi.fn() }))
vi.mock('virtual:$histoire-commands', () => ({ registeredCommands: [
  { id: 'first', label: 'Review first', searchText: 'Lookup verification', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showFirst !== false, clientAction: callbacks.first },
  { id: 'intended', label: 'Review intended', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showIntended !== false, clientAction: callbacks.intended },
  { id: 'last', label: 'Review last', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showLast !== false, clientAction: callbacks.last },
] }))
vi.mock('virtual:$histoire-stories', () => ({ files: [{ component: {}, story: { id: 'a:b', title: 'First', variants: [{ id: 'c', title: 'One' }] } }], onUpdate: () => () => {} }))

describe('standalone workbench search and command integration', () => {
  it.each(['generated', 'external'] as const)('omits editor command for %s stories', async (fileOrigin) => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].fileOrigin = fileOrigin
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const commands = createStandaloneCommands(session, createRouter({ history: createMemoryHistory(), routes: [] }))
    try {
      expect(commands.list('Open file').map(command => command.id)).not.toContain('builtin:open-in-editor')
    }
    finally {
      commands.close()
      await session.dispose()
    }
  })

  it('matches configured searchText aliases while retaining live command visibility', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const commands = createStandaloneCommands(session, createRouter({ history: createMemoryHistory(), routes: [] }))
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SearchPanel, { commands }) } })
    try {
      await wrapper.get('input').setValue('>VERIFICATION')
      await vi.waitFor(() => expect(wrapper.findAll('[data-search-kind=command]').map(button => button.text())).toEqual(['Review first']))
      await session.state.patch({ showFirst: false })
      await vi.waitFor(() => expect(wrapper.findAll('[data-search-kind=command]')).toHaveLength(0))
    }
    finally {
      wrapper.unmount()
      commands.close()
      await session.dispose()
    }
  })

  it.each(['history', 'hash'] as const)('opens matching Docs tab with exact docs target through %s route adapter', async (mode) => {
    const fixture = sourceFixture()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve([{ target: { storyId: 'a:b', variantId: null }, kind: 'docs', title: 'Documentation needle', rank: 0, anchor: '#part' }]) : dispatch(command, payload))
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    await navigation.router.push('/story/a:b?variantId=other&tab=events')
    await navigation.synchronize()
    expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
    const commands = createStandaloneCommands(selection.session, navigation.router)
    const wrapper = mount(HistoireProvider, { props: { session: selection.session }, slots: { default: () => h(SearchPanel, { commands }) } })
    try {
      await wrapper.get('input').setValue('needle')
      await vi.waitFor(() => expect(wrapper.findAll('[data-test-id=search-item]').some(button => button.text() === 'Documentation needle')).toBe(true))
      await wrapper.findAll('[data-test-id=search-item]').find(button => button.text() === 'Documentation needle')!.trigger('click')
      await vi.waitFor(() => expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null }))
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.query.tab).toBe('docs'))
      expect(navigation.router.currentRoute.value.query.variantId).toBeNull()
      expect(navigation.router.currentRoute.value.hash).toBe('#part')
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      commands.close()
      navigation.close()
      selection.close()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })
  it.each(['earlier', 'highlighted', 'all'] as const)('reconciles %s command removal before keyboard activation', async (removal) => {
    const fixture = sourceFixture()
    const request = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve([]) : request(command, payload))
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    await session.state.get()
    const commands = createStandaloneCommands(session, createRouter({ history: createMemoryHistory(), routes: [] }))
    for (const callback of Object.values(callbacks)) callback.mockClear()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SearchPanel, { commands }) } })
    try {
      await wrapper.get('input').setValue('>Review')
      await vi.waitFor(() => expect(wrapper.findAll('[data-search-kind=command]')).toHaveLength(3))
      await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.get('[data-search-active-result]').text()).toContain('Review intended')
      const retiredButton = wrapper.findAll('[data-search-kind=command]')[removal === 'highlighted' ? 1 : 0].element as HTMLButtonElement
      const patch = removal === 'earlier' ? { showFirst: false } : removal === 'highlighted' ? { showIntended: false } : { showFirst: false, showIntended: false, showLast: false }
      await session.state.patch(patch)
      // A retained DOM reference cannot invoke a now-hidden command either.
      retiredButton.click()
      await vi.waitFor(() => expect(wrapper.findAll('[data-search-kind=command]').map(button => button.text())).toEqual(removal === 'earlier' ? ['Review intended', 'Review last'] : removal === 'highlighted' ? ['Review first', 'Review last'] : []))
      if (removal === 'earlier') expect(wrapper.get('[data-search-active-result]').text()).toContain('Review intended')
      else expect(wrapper.find('[data-search-active-result]').exists()).toBe(false)
      await wrapper.get('input').trigger('keydown', { key: 'Enter' })
      if (removal === 'earlier') await vi.waitFor(() => expect(callbacks.intended).toHaveBeenCalledOnce())
      else expect(callbacks.intended).not.toHaveBeenCalled()
      expect(callbacks.first).not.toHaveBeenCalled()
      expect(callbacks.last).not.toHaveBeenCalled()
      if (removal === 'highlighted') {
        await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' })
        expect(wrapper.get('[data-search-active-result]').text()).toContain('Review last')
        await wrapper.get('input').trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => expect(callbacks.last).toHaveBeenCalledOnce())
      }
    }
    finally {
      wrapper.unmount()
      commands.close()
      await session.dispose()
    }
  })

  it('updates actual registry visibility reactively and releases owned subscriptions once', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const subscribe = session.subscribe
    const stops: ReturnType<typeof vi.fn>[] = []
    vi.spyOn(session, 'subscribe').mockImplementation((listener) => {
      const stop = vi.fn(subscribe(listener))
      stops.push(stop)
      return stop
    })
    const commands = createStandaloneCommands(session, createRouter({ history: createMemoryHistory(), routes: [] }))
    const visible = computed(() => commands.list('Review').map(command => command.id))
    try {
      expect(visible.value).toEqual(['first', 'intended', 'last'])
      await session.state.patch({ showFirst: false })
      expect(visible.value).toEqual(['intended', 'last'])
      commands.close()
      commands.close()
      expect(visible.value).toEqual([])
      expect(stops.length).toBeGreaterThan(0)
      expect(stops.every(stop => stop.mock.calls.length === 1)).toBe(true)
    }
    finally {
      commands.close()
      await session.dispose()
    }
  })
})
