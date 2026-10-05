import type { ClientCommandContext } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { StandaloneCommandPalette } from '../../../histoire-app/src/app/standalone/CommandPalette.js'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

// Standalone normally uses compiled vendor aliases; use genuine source provider
// symbols here, retaining actual search and palette behavior in one Vue runtime.
vi.mock('@histoire/vue', async () => ({ HistoireSearch: (await import('../components/search/HistoireSearch.js')).HistoireSearch }))
vi.mock('@histoire/vue/internal', async () => ({ ...(await import('../provider/context.js')), ...(await import('../provider/shortcuts.js')), ...(await import('../search/navigation.js')) }))
vi.mock('../../../histoire-app/src/app/components/command/CommandPrompts.vue', () => ({ default: { render: () => h('form') } }))

const callbacks = vi.hoisted(() => ({ first: vi.fn(), intended: vi.fn(), last: vi.fn() }))
vi.mock('virtual:$histoire-commands', () => ({ registeredCommands: [
  { id: 'first', label: 'Review first', searchText: 'Lookup verification', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showFirst !== false, clientAction: callbacks.first },
  { id: 'intended', label: 'Review intended', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showIntended !== false, clientAction: callbacks.intended },
  { id: 'last', label: 'Review last', showIf: ({ currentVariant }: ClientCommandContext) => currentVariant?.state.showLast !== false, clientAction: callbacks.last },
] }))
vi.mock('virtual:$histoire-stories', () => ({ files: [{ component: {}, story: { id: 'a:b', title: 'First', variants: [{ id: 'c', title: 'One' }] } }], onUpdate: () => () => {} }))

describe('standalone combined search navigation', () => {
  it('matches configured searchText aliases while retaining live command visibility', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const commands = createStandaloneCommands(session, createRouter({ history: createMemoryHistory(), routes: [] }))
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(StandaloneCommandPalette, { commands }) } })
    try {
      await wrapper.get('input').setValue('VERIFICATION')
      await vi.waitFor(() => expect(wrapper.findAll('dialog > button').map(button => button.text())).toEqual(['Review first']))
      await session.state.patch({ showFirst: false })
      await vi.waitFor(() => expect(wrapper.findAll('dialog > button')).toHaveLength(0))
    }
    finally {
      wrapper.unmount()
      commands.close()
      await session.dispose()
    }
  })

  it.each(['history', 'hash'] as const)('opens matching Docs tab with remembered variant through %s route adapter', async (mode) => {
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
    const wrapper = mount(HistoireProvider, { props: { session: selection.session }, slots: { default: () => h(StandaloneCommandPalette, { commands }) } })
    // jsdom has no dialog lifecycle; browser gates own native close/focus behavior.
    Object.defineProperty(wrapper.get('dialog').element, 'close', { value: vi.fn() })
    try {
      await wrapper.get('input').setValue('needle')
      await vi.waitFor(() => expect(wrapper.findAll('li button').some(button => button.text() === 'Documentation needle')).toBe(true))
      await wrapper.findAll('li button').find(button => button.text() === 'Documentation needle')!.trigger('click')
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
  it.each(['command', 'story', 'command-only'] as const)('activates intended %s once with one combined navigation owner', async (target) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    if (target === 'command-only') fixture.request.mockResolvedValue([])
    const select = vi.spyOn(session.selection, 'select')
    const command = { id: 'first-command', label: 'First command', clientAction: () => {} }
    const execute = vi.fn(async () => {})
    const commands = { list: () => [command], execute, context: () => ({}) }
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(StandaloneCommandPalette, { commands }) } })
    try {
      await wrapper.get('input').setValue('First')
      await vi.waitFor(() => expect(wrapper.findAll('li button')).toHaveLength(target === 'command-only' ? 0 : 1))
      if (target !== 'command-only') await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
      if (target === 'story') await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' })
      await wrapper.get('input').trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(target === 'story' ? select : execute).toHaveBeenCalledOnce())
      expect(target === 'story' ? execute : select).not.toHaveBeenCalled()
      if (target === 'story') expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    }
    finally {
      wrapper.unmount()
      await session.dispose()
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
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(StandaloneCommandPalette, { commands }) } })
    try {
      await wrapper.get('input').setValue('Review')
      await vi.waitFor(() => expect(wrapper.text()).toContain('No matches'))
      await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.get('button[aria-current=true]').text()).toBe('Review intended')
      const retiredButton = wrapper.findAll('dialog > button')[removal === 'highlighted' ? 1 : 0].element as HTMLButtonElement
      const patch = removal === 'earlier' ? { showFirst: false } : removal === 'highlighted' ? { showIntended: false } : { showFirst: false, showIntended: false, showLast: false }
      await session.state.patch(patch)
      // A retained DOM reference cannot invoke a now-hidden command either.
      retiredButton.click()
      await vi.waitFor(() => expect(wrapper.findAll('dialog > button').map(button => button.text())).toEqual(removal === 'earlier' ? ['Review intended', 'Review last'] : removal === 'highlighted' ? ['Review first', 'Review last'] : []))
      if (removal === 'earlier') expect(wrapper.get('button[aria-current=true]').text()).toBe('Review intended')
      else expect(wrapper.find('button[aria-current=true]').exists()).toBe(false)
      await wrapper.get('input').trigger('keydown', { key: 'Enter' })
      if (removal === 'earlier') await vi.waitFor(() => expect(callbacks.intended).toHaveBeenCalledOnce())
      else expect(callbacks.intended).not.toHaveBeenCalled()
      expect(callbacks.first).not.toHaveBeenCalled()
      expect(callbacks.last).not.toHaveBeenCalled()
      if (removal === 'highlighted') {
        await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' })
        expect(wrapper.get('button[aria-current=true]').text()).toBe('Review last')
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
