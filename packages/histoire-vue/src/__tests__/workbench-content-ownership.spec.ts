import type { HistoireDocsContent, HistoireSourceContent } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import SourceDrawer from '../../../histoire-app/src/app/components/inspector/SourceDrawer.vue'
import MarkdownPage from '../../../histoire-app/src/app/components/pages/markdown/MarkdownPage.vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Real session fixture owns source notifications; components keep their actual provider. */
async function setup() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const preview = session.mount(document.createElement('div'), { surface: 'preview' })
  await preview.ready
  await session.state.get()
  return { fixture, session, preview }
}

describe('workbench content ownership', () => {
  it('preserves current generated source and copy after unrelated SDK publications', async () => {
    const { fixture, session, preview } = await setup()
    const read = vi.spyOn(session.source, 'get').mockImplementation(async options => ({ ...options, epoch: 'epoch-1', revision: 'revision-1', origin: options.mode === 'raw' ? 'file' : 'dynamic', body: options.mode === 'raw' ? 'story source' : `count=${session.getSnapshot().state?.value.count}`, language: 'text' }))
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SourceDrawer) } })
    try {
      await wrapper.get('[aria-label="Expand source"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.get('.histoire-source-content').text()).toContain('count=5'))
      await session.state.patch({ count: 8 })
      await vi.waitFor(() => expect(wrapper.get('.histoire-source-content').text()).toContain('count=8'))
      await session.settings.update({ colorScheme: 'dark' })
      fixture.emitEvent()
      await nextTick()
      expect(read).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[aria-label="Copy source"]').attributes('disabled')).toBeUndefined()
      await wrapper.findAll('button').find(button => button.text() === 'Story file')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.get('.histoire-source-content').text()).toBe('story source'))
      await session.selection.select({ storyId: 'a:b', variantId: 'other' })
      await nextTick()
      expect(read).toHaveBeenCalledTimes(3)
      expect(wrapper.get('[aria-label="Copy source"]').attributes('disabled')).toBeUndefined()
    }
    finally {
      wrapper.unmount()
      await preview.unmount()
      await session.dispose()
    }
  })

  it('retires replaced source and suppresses old generated content', async () => {
    const { session, preview } = await setup()
    const delayed = deferred<HistoireSourceContent>()
    vi.spyOn(session.source, 'get').mockReturnValueOnce(delayed.promise).mockResolvedValue({ storyId: 'a', variantId: 'b:c', epoch: 'epoch-1', revision: 'revision-1', mode: 'dynamic', origin: 'dynamic', body: 'replacement', language: 'text' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SourceDrawer) } })
    try {
      await wrapper.get('[aria-label="Expand source"]').trigger('click')
      await session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await vi.waitFor(() => expect(wrapper.get('.histoire-source-content').text()).toBe('replacement'))
      delayed.resolve({ storyId: 'a:b', variantId: 'c', epoch: 'epoch-1', revision: 'revision-1', mode: 'dynamic', origin: 'dynamic', body: 'retired', language: 'text' })
      await delayed.promise
      await nextTick()
      expect(wrapper.get('.histoire-source-content').text()).toBe('replacement')
      expect(wrapper.get('[aria-label="Copy source"]').attributes('disabled')).toBeUndefined()
    }
    finally {
      wrapper.unmount()
      await preview.unmount()
      await session.dispose()
    }
  })

  it.each(['history', 'hash'] as const)('copies rendered heading and inline anchors without mutating %s host URL', async (mode) => {
    const { session, preview } = await setup()
    await session.selection.select({ storyId: 'docs', variantId: null })
    await preview.unmount()
    const copied = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } })
    window.history.replaceState({}, '', mode === 'hash' ? '/book/#/story/docs#previous' : '/book/story/docs#previous')
    const hostUrl = window.location.href
    vi.spyOn(session.docs, 'get').mockResolvedValue({ storyId: 'docs', epoch: 'epoch-1', revision: 'revision-1', origin: 'sibling', format: 'html', body: '<h2 id="install:item">Install<a class="header-anchor" href="#install%3Aitem">#</a></h2><p><a href="#next">Next</a></p><h2 id="next">Next</h2>' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(MarkdownPage) } })
    try {
      await vi.waitFor(() => expect(wrapper.findAll('.histoire-docs a')).toHaveLength(2))
      for (const [index, expected] of [['0', '#install%3Aitem'], ['1', '#next']] as const) {
        await wrapper.findAll('.histoire-docs a')[Number(index)].trigger('click')
        await wrapper.get('[aria-label="Copy link"]').trigger('click')
        await vi.waitFor(() => expect(copied).toHaveBeenCalled())
        expect(new URL(copied.mock.calls.at(-1)![0]).hash).toBe(mode === 'hash' ? `#/story/docs${expected}` : expected)
      }
      expect(window.location.href).toBe(hostUrl)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
      window.history.replaceState({}, '', '/')
    }
  })

  it('waits for dynamic preview readiness without reporting a pending selection as source failure', async () => {
    const { fixture, session, preview } = await setup()
    const pending = deferred<ReturnType<typeof fixture.runtime>>()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'selection.select' && payload.variantId === 'other'
      ? pending.promise
      : dispatch(command, payload))
    vi.spyOn(session.source, 'get').mockImplementation(async value => ({ ...value, epoch: 'epoch-1', revision: 'revision-1', origin: 'dynamic', body: `source:${value.variantId}`, language: 'text' }))
    const errors = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SourceDrawer, { onError: errors }) } })
    try {
      await wrapper.get('[aria-label="Expand source"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('source:c'))
      const selection = session.selection.select({ storyId: 'a:b', variantId: 'other' })
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('mounting'))
      expect(wrapper.get('[role="status"]').text()).toBe('Loading source…')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.find('.inspector-source-retry').exists()).toBe(false)
      expect(errors).not.toHaveBeenCalled()
      pending.resolve(fixture.runtime())
      await selection
      await vi.waitFor(() => expect(wrapper.text()).toContain('source:other'))
      expect(errors).not.toHaveBeenCalled()
      await wrapper.findAll('button').find(button => button.text() === 'Story file')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('source:undefined'))
      vi.mocked(session.source.get).mockRejectedValueOnce(new Error('Generated source failed'))
      await wrapper.findAll('button').find(button => button.text() === 'Variant')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('Generated source failed'))
      expect(wrapper.find('.inspector-source-retry').exists()).toBe(true)
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'Generated source failed' }))
    }
    finally {
      pending.resolve(fixture.runtime())
      wrapper.unmount()
      await preview.unmount()
      await session.dispose()
    }
  })

  it('publishes clipboard and editor failures only for their current exact owner', async () => {
    const { fixture, session, preview } = await setup()
    const staleClipboard = deferred<void>()
    const currentClipboard = deferred<void>()
    const staleEditor = deferred<null>()
    const currentEditor = deferred<null>()
    const clipboard = [staleClipboard, currentClipboard]
    const editor = [staleEditor, currentEditor]
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => clipboard.shift()!.promise) } })
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'openInEditor' ? editor.shift()!.promise : dispatch(command, payload))
    const errors = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(SourceDrawer, { onError: errors }) } })
    try {
      await wrapper.get('[aria-label="Expand source"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[aria-label="Copy source"]').attributes('disabled')).toBeUndefined())
      await wrapper.get('[aria-label="Copy source"]').trigger('click')
      await session.selection.select({ storyId: 'a:b', variantId: 'other' })
      staleClipboard.reject(new Error('Clipboard denied for predecessor'))
      await staleClipboard.promise.catch(() => {})
      await nextTick()
      expect(errors).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(wrapper.get('[aria-label="Open source in editor"]').exists()).toBe(true))
      await wrapper.get('[aria-label="Open source in editor"]').trigger('click')
      await session.selection.select({ storyId: 'a:b', variantId: 'c' })
      staleEditor.reject(new Error('Editor unavailable for predecessor'))
      await staleEditor.promise.catch(() => {})
      await nextTick()
      expect(errors).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(wrapper.find('[aria-label="Copy source"]').attributes('disabled')).toBeUndefined())
      await wrapper.get('[aria-label="Copy source"]').trigger('click')
      currentClipboard.reject(new Error('Clipboard denied for current source'))
      await currentClipboard.promise.catch(() => {})
      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'Clipboard denied for current source' })))
      await wrapper.get('[aria-label="Open source in editor"]').trigger('click')
      currentEditor.reject(new Error('Editor unavailable for current source'))
      await currentEditor.promise.catch(() => {})
      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'Editor unavailable for current source' })))
    }
    finally {
      staleClipboard.resolve()
      currentClipboard.resolve()
      staleEditor.resolve(null)
      currentEditor.resolve(null)
      wrapper.unmount()
      await preview.unmount()
      await session.dispose()
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('preserves same-document scroll, path and fallback title on theme and catalog publication', async () => {
    const { fixture, session, preview } = await setup()
    await session.selection.select({ storyId: 'docs', variantId: null })
    await preview.unmount()
    const read = vi.spyOn(session.docs, 'get').mockResolvedValue({ storyId: 'docs', epoch: 'epoch-1', revision: 'revision-1', origin: 'sibling', relativePath: 'intro.story.md', format: 'html', body: '<h2 id="part">Part</h2><p>Docs body</p>' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(MarkdownPage) } })
    try {
      await vi.waitFor(() => expect(wrapper.find('article > h1').exists()).toBe(true))
      const page = wrapper.get('main').element as HTMLElement
      page.scrollTop = 300
      await session.settings.update({ colorScheme: 'dark' })
      fixture.emitCatalog()
      await nextTick()
      expect(page.scrollTop).toBe(300)
      expect(wrapper.get('article > h1').text()).toBe('Docs')
      expect(wrapper.text()).toContain('intro.story.md')
      expect(read).toHaveBeenCalledOnce()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('resets document scroll for actual revisions and ignores overtaken content', async () => {
    const { fixture, session, preview } = await setup()
    await session.selection.select({ storyId: 'docs', variantId: null })
    await preview.unmount()
    const old = { storyId: 'docs', epoch: 'epoch-1', revision: 'revision-1', origin: 'sibling' as const, format: 'html' as const, body: '<h1>Old guide</h1>' }
    const delayed = deferred<HistoireDocsContent>()
    const read = vi.spyOn(session.docs, 'get').mockResolvedValueOnce(old).mockReturnValueOnce(delayed.promise).mockResolvedValue({ ...old, revision: 'revision-3', relativePath: 'new.story.md', body: '<p>Latest guide</p>' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(MarkdownPage) } })
    try {
      await vi.waitFor(() => expect(wrapper.text()).toContain('Old guide'))
      const page = wrapper.get('main').element as HTMLElement
      page.scrollTop = 300
      fixture.descriptor.revision = 'revision-2'
      fixture.emitCatalog()
      await nextTick()
      expect(page.scrollTop).toBe(0)
      expect(wrapper.find('article > h1').exists()).toBe(false)
      fixture.descriptor.revision = 'revision-3'
      fixture.emitCatalog()
      await vi.waitFor(() => expect(wrapper.text()).toContain('Latest guide'))
      delayed.resolve({ ...old, revision: 'revision-2', body: '<h1>Retired guide</h1>' })
      await delayed.promise
      await nextTick()
      expect(wrapper.text()).not.toContain('Retired guide')
      expect(wrapper.get('article > h1').text()).toBe('Docs')
      expect(wrapper.text()).toContain('new.story.md')
      expect(read).toHaveBeenCalledTimes(3)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
