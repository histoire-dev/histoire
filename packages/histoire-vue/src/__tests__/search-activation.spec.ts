import type { HistoireSearchResult } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireExplorer } from '../components/explorer/HistoireExplorer.js'
import { HistoireSearch } from '../components/search/HistoireSearch.js'
import { useHistoireContext } from '../provider/context.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

/** Actual source search projection activates panels without importing any story runtime. */
async function searchFixture(kind: HistoireSearchResult['kind'] = 'docs') {
  const fixture = sourceFixture()
  const dispatch = fixture.request.getMockImplementation()!
  const result: HistoireSearchResult = { target: { storyId: 'a:b', variantId: kind === 'docs' ? null : 'c' }, kind, title: 'Documentation needle', rank: 0 }
  fixture.request.mockImplementation((command, payload) => command === 'catalog.search' ? Promise.resolve([result]) : dispatch(command, payload))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a', variantId: 'b:c' })
  return { fixture, session, result }
}

/** Caller preview slot proves docs activation uses data alone and respects layout ownership. */
const explorer = () => h(HistoireExplorer, { showToolbar: false }, { preview: () => h('main', 'Caller preview') })

/** Real input/result click exercises Search, controller selection and panel composition together. */
async function activate(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('input[type=search]').setValue('needle')
  await vi.waitFor(() => expect(wrapper.findAll('li button').some(button => button.text() === 'Documentation needle')).toBe(true))
  await wrapper.findAll('li button').find(button => button.text() === 'Documentation needle')!.trigger('click')
}

describe('provider-owned search activation', () => {
  it('reveals mixed-story documentation after successful docs search without creating a runtime', async () => {
    const { fixture, session } = await searchFixture()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: explorer } })
    try {
      await activate(wrapper)
      await vi.waitFor(() => expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null }))
      expect(wrapper.get('[role=tab][aria-selected=true]').text()).toBe('Docs')
      await vi.waitFor(() => expect(wrapper.get('[aria-label="Histoire documentation"]').text()).toBe('Docs'))
      expect(fixture.adapters.mount).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('keeps neighboring provider and normal variant searches on their current panel', async () => {
    const first = await searchFixture()
    const second = await searchFixture('variant')
    const wrapper = mount(defineComponent({ render: () => h('div', [first, second].map(({ session }) => h(HistoireProvider, { session }, { default: explorer }))) }))
    const providers = wrapper.findAllComponents(HistoireProvider)
    try {
      await activate(providers[0])
      await vi.waitFor(() => expect(providers[0].get('[role=tab][aria-selected=true]').text()).toBe('Docs'))
      expect(providers[1].get('[role=tab][aria-selected=true]').text()).toBe('Controls')
      await activate(providers[1])
      await vi.waitFor(() => expect(second.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' }))
      expect(providers[1].get('[role=tab][aria-selected=true]').text()).toBe('Controls')
    }
    finally {
      wrapper.unmount()
      await Promise.all([first.session.dispose(), second.session.dispose()])
    }
  })

  it('reports independent search result without creating panels or changing host URL/title', async () => {
    const { session, result } = await searchFixture()
    const select = vi.fn()
    const previous = { url: window.location.href, title: document.title }
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireSearch, { onSelect: select }) } })
    try {
      await activate(wrapper)
      await vi.waitFor(() => expect(select).toHaveBeenCalledWith(result))
      expect(wrapper.find('[role=tablist]').exists()).toBe(false)
      expect(window.location.href).toBe(previous.url)
      expect(document.title).toBe(previous.title)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('retires captured docs intent after content revision and does not replay it', async () => {
    const { fixture, session, result } = await searchFixture()
    let context: ReturnType<typeof useHistoireContext> | undefined
    const Probe = defineComponent({ setup() {
      context = useHistoireContext()
      return () => h('span')
    } })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => [h(HistoireSearch), h(Probe)] } })
    try {
      const source = session.getSnapshot().source
      await activate(wrapper)
      await vi.waitFor(() => expect(context!.panels.docs.value?.target).toEqual(result.target))
      fixture.descriptor.revision = 'new-content'
      fixture.emitCatalog()
      expect(context!.panels.docs.value).toBeNull()
      context!.panels.showDocs(result, source)
      expect(context!.panels.docs.value).toBeNull()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it.each([
    { kind: 'docs', replacement: 'source' },
    { kind: 'variant', replacement: 'source' },
    { kind: 'docs', replacement: 'selection' },
    { kind: 'variant', replacement: 'selection' },
  ] as const)('drops $kind activation overtaken by $replacement after selection acknowledgment', async ({ kind, replacement }) => {
    const { fixture, session } = await searchFixture(kind)
    const original = session.selection.select
    vi.spyOn(session.selection, 'select').mockImplementation((target) => {
      const operation = original(target)
      // This observer settles before Search's activation callback. Publication
      // retirement must also guard emitted host/standalone navigation intent.
      void operation.then(() => {
        if (replacement === 'selection') return original({ storyId: 'a', variantId: 'b:c' })
        fixture.descriptor.revision = 'replacement-content'
        fixture.emitCatalog()
      }).catch(() => {})
      return operation
    })
    const selected = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireSearch, { onSelect: selected }) } })
    try {
      await activate(wrapper)
      await vi.waitFor(() => expect(replacement === 'source' ? session.getSnapshot().source?.revision : session.getSnapshot().selection?.storyId).toBe(replacement === 'source' ? 'replacement-content' : 'a'))
      expect(selected).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('cannot publish old child activation after provider changes to another matching session', async () => {
    const first = await searchFixture()
    const second = await searchFixture()
    await Promise.all([first, second].map(({ session, result }) => session.selection.select(result.target)))
    const pending = deferred<void>()
    vi.spyOn(first.session.selection, 'select').mockImplementationOnce(() => pending.promise)
    const selected = vi.fn()
    let context: ReturnType<typeof useHistoireContext> | undefined
    const Probe = defineComponent({ setup() {
      context = useHistoireContext()
      return () => h('span')
    } })
    const wrapper = mount(HistoireProvider, { props: { session: first.session }, slots: { default: () => [h(HistoireSearch, { onSelect: selected }), h(Probe)] } })
    try {
      await activate(wrapper)
      await wrapper.setProps({ session: second.session })
      pending.resolve()
      await nextTick()
      expect(context!.panels.docs.value).toBeNull()
      expect(selected).not.toHaveBeenCalled()
    }
    finally {
      pending.resolve()
      wrapper.unmount()
      await Promise.all([first.session.dispose(), second.session.dispose()])
    }
  })

  it.each(['hidden', 'slot'] as const)('preserves explicit %s panel ownership on docs activation', async (mode) => {
    const { session } = await searchFixture()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireExplorer, { showToolbar: false, showPanels: mode !== 'hidden' }, { preview: () => h('main'), ...(mode === 'slot' ? { panels: () => h('aside', 'Caller panels') } : {}) }) } })
    try {
      await activate(wrapper)
      await vi.waitFor(() => expect(session.getSnapshot().selection?.storyId).toBe('a:b'))
      expect(wrapper.find('[role=tablist]').exists()).toBe(false)
      if (mode === 'slot') expect(wrapper.text()).toContain('Caller panels')
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
