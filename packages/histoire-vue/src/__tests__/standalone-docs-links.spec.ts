import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireDocs } from '../components/docs/HistoireDocs.js'
import { ExplorerPanels } from '../components/explorer/ExplorerPanels.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('standalone documentation link delivery', () => {
  it.each(['history', 'hash'] as const)('keeps requested docs tab and anchor in %s mode', async (mode) => {
    const fixture = sourceFixture()
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    await navigation.router.push('/story/a:b?variantId=c&tab=docs')
    await navigation.synchronize()
    vi.spyOn(selection.session.docs, 'get').mockImplementation(async storyId => ({ storyId, epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: '<a href="/book/story/a?variantId=b%3Ac&amp;tab=docs#part" data-route="true">Target documentation</a><h2 id="part">Part</h2>' }))
    const wrapper = mount(HistoireProvider, { props: { session: selection.session }, slots: { default: () => h(ExplorerPanels, { activePanel: typeof navigation.router.currentRoute.value.query.tab === 'string' ? navigation.router.currentRoute.value.query.tab : 'controls', docsAnchor: navigation.router.currentRoute.value.hash, onError: errors }) } })
    try {
      await vi.waitFor(() => expect(wrapper.find('a').exists()).toBe(true))
      await wrapper.get('a').trigger('click')
      await vi.waitFor(() => expect(core.getSnapshot().selection).toEqual({ storyId: 'a', variantId: 'b:c' }))
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.params.storyId).toBe('a'))
      expect({ tab: navigation.router.currentRoute.value.query.tab, anchor: navigation.router.currentRoute.value.hash, panel: wrapper.get('[role="tab"][aria-selected="true"]').text() }).toEqual({ tab: 'docs', anchor: '#part', panel: 'Docs' })
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      navigation.close()
      selection.close()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })

  it.each(['history', 'hash'] as const)('follows canonical explicit-null and dot-only links in %s mode', async (mode) => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories.push({ ...fixture.descriptor.catalog.stories[0], id: '..' })
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    await navigation.router.push('/story/a:b?variantId=c')
    await navigation.synchronize()
    const href = navigation.router.resolve({ name: 'story', params: {}, query: { storyId: '..', variantId: null }, hash: '#part' }).href
    vi.spyOn(selection.session.docs, 'get').mockImplementation(async storyId => ({ storyId, epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: `<a href="${href}" data-route="true">Target documentation</a><h2 id="part">Part</h2>` }))
    const wrapper = mount(HistoireProvider, { props: { session: selection.session }, slots: { default: () => h(HistoireDocs, { onError: errors }) } })
    try {
      await vi.waitFor(() => expect(wrapper.find('a').exists()).toBe(true))
      await wrapper.get('a').trigger('click')
      await vi.waitFor(() => expect(core.getSnapshot().selection).toEqual({ storyId: '..', variantId: null }))
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.query.variantId).toBeNull())
      expect(navigation.router.currentRoute.value.hash).toBe('#part')
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      navigation.close()
      selection.close()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })

  it('keeps native host URL unchanged and applies anchor only inside docs panel', async () => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    await core.selection.select({ storyId: 'a:b', variantId: 'c' })
    vi.spyOn(core.docs, 'get').mockImplementation(async storyId => ({ storyId, epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: '<a href="/book/story/a?variantId=b%3Ac&amp;tab=docs#part">Target documentation</a><h2 id="part">Part</h2>' }))
    const previous = { url: window.location.href, title: document.title }
    const wrapper = mount(HistoireProvider, { props: { session: core }, slots: { default: () => h(HistoireDocs) } })
    try {
      await vi.waitFor(() => expect(wrapper.find('h2').exists()).toBe(true))
      const panel = wrapper.findComponent(HistoireDocs).element as HTMLElement
      panel.getBoundingClientRect = vi.fn().mockReturnValue({ top: 20 })
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return { top: this.tagName === 'H2' ? 120 : 20 } as DOMRect
      })
      await wrapper.get('a').trigger('click')
      await vi.waitFor(() => expect(core.getSnapshot().selection).toEqual({ storyId: 'a', variantId: 'b:c' }))
      await vi.waitFor(() => expect(panel.scrollTop).toBe(100))
      expect({ url: window.location.href, title: document.title }).toEqual(previous)
      expect(fixture.adapters.mount).not.toHaveBeenCalled()
    }
    finally {
      vi.restoreAllMocks()
      wrapper.unmount()
      await core.dispose()
    }
  })

  it.each(['source', 'unmount'] as const)('drops delayed native anchor after %s replacement', async (replacement) => {
    const fixture = sourceFixture()
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    await core.selection.select({ storyId: 'a:b', variantId: 'c' })
    vi.spyOn(core.docs, 'get').mockImplementation(async storyId => ({ storyId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, origin: 'inline', format: 'html', body: '<a href="/book/story/a?variantId=b%3Ac#part">Target documentation</a><h2 id="part">Part</h2>' }))
    const pending = deferred<void>()
    const select = core.selection.select
    vi.spyOn(core.selection, 'select').mockImplementationOnce(async (target) => {
      await select(target)
      await pending.promise
    })
    const errors = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session: core }, slots: { default: () => h(HistoireDocs, { onError: errors }) } })
    try {
      await vi.waitFor(() => expect(wrapper.find('h2').exists()).toBe(true))
      const panel = wrapper.findComponent(HistoireDocs).element as HTMLElement
      panel.getBoundingClientRect = vi.fn().mockReturnValue({ top: 20 })
      await wrapper.get('a').trigger('click')
      if (replacement === 'source') {
        fixture.descriptor.revision = 'replacement'
        fixture.emitCatalog()
      }
      else {
        wrapper.unmount()
      }
      pending.resolve()
      await pending.promise
      await Promise.resolve()
      expect(panel.scrollTop).toBe(0)
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      pending.resolve()
      if (wrapper.exists()) wrapper.unmount()
      await core.dispose()
    }
  })
})
