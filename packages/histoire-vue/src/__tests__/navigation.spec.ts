import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoirePreview } from '../components/preview/HistoirePreview.js'
import { HistoireSearch } from '../components/search/HistoireSearch.js'
import { HistoireToolbar } from '../components/toolbar/HistoireToolbar.js'
import { HistoireStoryTree } from '../components/tree/HistoireStoryTree.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { focusHistoireSearch, HISTOIRE_SEARCH_FOCUS } from '../provider/shortcuts.js'
import { selectControl, selectLabels } from './fixtures/select.js'

describe('independent session navigation', () => {
  it('keeps independent search keyboard navigation without a palette or host shortcut owner', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    fixture.request.mockResolvedValue([
      { target: { storyId: 'a:b', variantId: 'c' }, kind: 'story', title: 'First', rank: 0 },
      { target: { storyId: 'docs', variantId: null }, kind: 'docs', title: 'Docs match', rank: 1 },
    ])
    const select = vi.spyOn(session.selection, 'select')
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireSearch) } })
    try {
      await wrapper.get('input').setValue('match')
      await vi.waitFor(() => expect(wrapper.findAll('li button')).toHaveLength(2))
      await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' })
      await wrapper.get('input').trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null }))
      expect(select).toHaveBeenCalledOnce()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('lets owning dialog reveal search before native focus occurs', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => [h('button', 'Open'), h(HistoireSearch)] }, attachTo: document.body })
    const request = vi.fn((event: Event) => event.preventDefault())
    wrapper.element.addEventListener(HISTOIRE_SEARCH_FOCUS, request)
    const button = wrapper.get('button').element
    button.focus()
    focusHistoireSearch(wrapper.element as HTMLElement)
    expect(request).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(button)
    wrapper.element.removeEventListener(HISTOIRE_SEARCH_FOCUS, request)
    focusHistoireSearch(wrapper.element as HTMLElement)
    expect(document.activeElement).toBe(wrapper.get('input').element)
    wrapper.unmount()
    await session.dispose()
  })
  it('selects exact scoped IDs and refreshes tree after catalog publication without runtime', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireStoryTree) } })
    await wrapper.get('button[aria-label="First / Two"]').trigger('click')
    expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
    fixture.descriptor.catalog.tree = [{ kind: 'story', storyId: 'docs', title: 'Docs' }]
    fixture.emitCatalog()
    await nextTick()
    await wrapper.get('button[aria-label="Docs"]').trigger('click')
    expect(session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
    expect(fixture.adapters.mount).not.toHaveBeenCalled()
    fixture.descriptor.capabilities.catalog = { available: false, reason: 'COLLECTION_FAILED' }
    fixture.emitCatalog()
    await nextTick()
    expect(session.getSnapshot().status).toBe('ready')
    expect(wrapper.get('[role="alert"]').text()).toBe('Catalog unavailable')
    wrapper.unmount()
    await session.dispose()
  })

  it('drops superseded search responses and refreshes same query on source revision', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const old = deferred<any>()
    fixture.request.mockImplementation(async (command, payload) => command === 'catalog.search' ? payload.query === 'old' ? old.promise : [{ target: { storyId: 'docs', variantId: null }, kind: 'docs', title: 'Docs match', rank: 0 }] : undefined)
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireSearch) } })
    await wrapper.get('input').setValue('old')
    await wrapper.get('input').setValue('new')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Docs match'))
    old.resolve([{ target: { storyId: 'a:b', variantId: 'c' }, kind: 'variant', title: 'Old match', rank: 0 }])
    await nextTick()
    expect(wrapper.text()).not.toContain('Old match')
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    await vi.waitFor(() => expect(fixture.request.mock.calls.filter(([command]) => command === 'catalog.search')).toHaveLength(3))
    await wrapper.get('button').trigger('click')
    expect(session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
    wrapper.unmount()
    await session.dispose()
  })

  it('handles search shortcut only inside focused provider and cleans listeners', async () => {
    const first = sourceFixture()
    const second = sourceFixture()
    const sessions = [first, second].map(fixture => createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters))
    await Promise.all(sessions.map(session => session.connect()))
    const wrapper = mount({ render: () => h('main', [h('input', { id: 'host' }), ...sessions.map(session => h(HistoireProvider, { session }, { default: () => [h('button', 'Focus'), h(HistoireSearch)] }))]) }, { attachTo: document.body })
    const inputs = wrapper.findAll('input')
    const buttons = wrapper.findAll('button')
    inputs[0].element.focus()
    const host = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    inputs[0].element.dispatchEvent(host)
    expect(host.defaultPrevented).toBe(false)
    buttons[1].element.focus()
    const shortcut = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    buttons[1].element.dispatchEvent(shortcut)
    expect(document.activeElement).toBe(inputs[2].element)
    expect(shortcut.defaultPrevented).toBe(true)
    const detached = buttons[1].element
    wrapper.unmount()
    const removed = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    detached.dispatchEvent(removed)
    expect(removed.defaultPrevented).toBe(false)
    await Promise.all(sessions.map(session => session.dispose()))
  })

  it('updates toolbar preferences without creating runtime and keeps neighbor unchanged', async () => {
    const fixtures = [sourceFixture(), sourceFixture()]
    fixtures[0].descriptor.config = { title: 'Histoire', backgroundPresets: [{ label: 'Transparent', color: 'transparent' }, { label: 'White', color: '#fff' }], responsivePresets: [], theme: { defaultColorScheme: 'auto', darkClass: 'dark' }, autoApplyContrastColor: false, storyCollectTimeout: 30000, runTimeout: 60000, globals: {}, textDirection: 'ltr' }
    const sessions = fixtures.map(fixture => createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters))
    await Promise.all(sessions.map(session => session.connect()))
    const wrapper = mount(HistoireProvider, { props: { session: sessions[0] }, slots: { default: () => h(HistoireToolbar) } })
    expect(selectLabels(wrapper, 'Background')).toEqual(['Transparent', 'White'])
    await selectControl(wrapper, '#fff', 'Background')
    expect(sessions[0].getSnapshot().settings.backgroundColor).toBe('#fff')
    await selectControl(wrapper, 'dark', 'Appearance')
    await selectControl(wrapper, 'rtl', 'Direction')
    await wrapper.get('input[aria-label="Viewport width"]').setValue('430')
    expect(sessions[0].getSnapshot().settings).toMatchObject({ colorScheme: 'dark', textDirection: 'rtl', responsiveWidth: 430 })
    expect(sessions[1].getSnapshot().settings.colorScheme).toBe('auto')
    expect(fixtures[0].adapters.mount).not.toHaveBeenCalled()
    wrapper.unmount()
    await Promise.all(sessions.map(session => session.dispose()))
  })

  it('reveals absent owning search from current source document and rejects stale focus', async () => {
    const fixture = sourceFixture()
    let receive = (_event: any) => {}
    const original = fixture.adapters.mount!
    fixture.adapters.mount = context => ({ ...original(context), channel: { subscribe(listener) {
      receive = listener
      return () => {}
    }, post() {} } })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    const nestedFixture = sourceFixture()
    const nestedSession = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, nestedFixture.adapters)
    await session.connect()
    await nestedSession.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const revealed = ref(false)
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => [h(HistoireProvider, { session: nestedSession }, { default: () => h(HistoireSearch) }), revealed.value ? h(HistoireSearch) : null, h(HistoirePreview)] }, attachTo: document.body })
    const request = vi.fn(async (event: Event) => {
      if (event.target !== wrapper.element) return
      event.preventDefault()
      revealed.value = true
      await nextTick()
      wrapper.findAll('input')[1].element.focus()
    })
    wrapper.element.addEventListener(HISTOIRE_SEARCH_FOCUS, request)
    await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
    const snapshot = session.getSnapshot()
    const event = { protocolVersion: 1, sessionId: 'session', connectionId: 'source-port', mountId: snapshot.runtime.mountId!, sourceId: snapshot.source!.sourceId, epoch: snapshot.source!.epoch, revision: snapshot.source!.revision, runtimeId: snapshot.runtime.runtimeId!, target: snapshot.selection!, kind: 'event' as const, event: 'focus.changed' as const, sequence: 1, payload: { focused: true, action: 'search' } }
    receive({ ...event, runtimeId: 'retired' })
    expect(revealed.value).toBe(false)
    expect(request).not.toHaveBeenCalled()
    receive(event)
    await nextTick()
    expect(request).toHaveBeenCalledOnce()
    const ownInput = wrapper.findAll('input')[1].element
    expect(document.activeElement).toBe(ownInput)
    wrapper.element.removeEventListener(HISTOIRE_SEARCH_FOCUS, request)
    wrapper.unmount()
    receive(event)
    expect(document.activeElement).not.toBe(wrapper.element)
    await session.dispose()
    await nestedSession.dispose()
  })
})
