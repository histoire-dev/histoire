import { HistoireSdkError } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireDocs } from '../components/docs/HistoireDocs.js'
import { HistoireSource } from '../components/source/HistoireSource.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

vi.mock('shiki', () => ({ createHighlighter: async () => {
  throw new Error('highlight unavailable')
} }))

/** Existing SDK fixture supplies one canonical controller and source transport. */
async function fixture() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  return { fixture, session }
}

describe('independent docs/source panels', () => {
  it('renders sanitized data-only docs, routes exact story link, and preserves caller session', async () => {
    const test = await fixture()
    vi.spyOn(test.session.docs, 'get').mockImplementation(async storyId => ({ storyId, epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: '<h2 id="part">Inline</h2><a href="story/a?variantId=b%3Ac" data-route="true">Other story</a><script>attack()</script>' }))
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireDocs) } })
    await vi.waitFor(() => expect(wrapper.find('h2').text()).toBe('Inline'))
    expect(wrapper.find('script').exists()).toBe(false)
    expect(test.fixture.adapters.mount).not.toHaveBeenCalled()
    await wrapper.get('a').trigger('click')
    await vi.waitFor(() => expect(test.session.getSnapshot().selection).toEqual({ storyId: 'a', variantId: 'b:c' }))
    wrapper.unmount()
    expect(test.session.getSnapshot().status).toBe('ready')
    await test.session.dispose()
  })

  it('keeps raw source data-only and uses plain safe text when highlighting fails', async () => {
    const test = await fixture()
    const read = vi.spyOn(test.session.source, 'get').mockResolvedValue({ storyId: 'a:b', epoch: 'epoch-1', revision: 'revision-1', mode: 'raw', origin: 'file', body: '<script>attack()</script>' })
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireSource) } })
    await vi.waitFor(() => expect(wrapper.find('pre').text()).toBe('<script>attack()</script>'))
    expect(wrapper.find('script').exists()).toBe(false)
    expect(test.fixture.adapters.mount).not.toHaveBeenCalled()
    await wrapper.findAll('button')[1].trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('Dynamic source requires ready preview'))
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][0].mode).toBe('raw')
    wrapper.unmount()
    await test.session.dispose()
  })

  it('clears overtaken docs during preparation and preserves intentional empty content', async () => {
    const test = await fixture()
    const delayed = deferred<any>()
    vi.spyOn(test.session.docs, 'get').mockReturnValueOnce(delayed.promise).mockResolvedValue({ storyId: 'a', epoch: 'epoch-1', revision: 'revision-1', origin: 'sibling', format: 'html', body: '' })
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireDocs) } })
    await test.session.selection.select({ storyId: 'a', variantId: 'b:c' })
    await vi.waitFor(() => expect(wrapper.findComponent(HistoireDocs).emitted('content')).toHaveLength(1))
    delayed.resolve({ storyId: 'a:b', epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: '<p>old</p>' })
    await delayed.promise
    await Promise.resolve()
    expect(wrapper.text()).not.toContain('old')
    expect(wrapper.findComponent(HistoireDocs).emitted('content')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    vi.mocked(test.session.docs.get).mockRejectedValue(new HistoireSdkError('DOCS_NOT_FOUND', 'No documentation available'))
    await test.session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('No documentation available'))
    expect(wrapper.findComponent(HistoireDocs).emitted('content')).toHaveLength(1)
    wrapper.unmount()
    await test.session.dispose()
  })

  it('publishes source status only for current source generation and preserves empty content', async () => {
    const test = await fixture()
    const delayed = deferred<any>()
    vi.spyOn(test.session.source, 'get').mockReturnValueOnce(delayed.promise).mockResolvedValue({ storyId: 'a', epoch: 'epoch-1', revision: 'revision-1', mode: 'raw', origin: 'file', body: '' })
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireSource, { appearance: 'dark' }) } })
    const panel = wrapper.findComponent(HistoireSource)
    await vi.waitFor(() => expect(panel.emitted('status')).toEqual([[{ status: 'loading', empty: false }]]))
    await test.session.selection.select({ storyId: 'a', variantId: 'b:c' })
    await vi.waitFor(() => expect(panel.emitted('content')).toHaveLength(1))
    expect(panel.emitted('status')?.at(-1)).toEqual([{ status: 'ready', empty: true }])
    const publications = panel.emitted('status')?.length
    delayed.resolve({ storyId: 'a:b', epoch: 'epoch-1', revision: 'revision-1', mode: 'raw', origin: 'file', body: 'old' })
    await delayed.promise
    await Promise.resolve()
    expect(panel.emitted('status')).toHaveLength(publications!)
    expect(panel.emitted('content')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('old')
    wrapper.unmount()
    await test.session.dispose()
  })

  it('does not apply delayed story-link anchor to another selected story', async () => {
    const test = await fixture()
    vi.spyOn(test.session.docs, 'get').mockResolvedValue({ storyId: 'a:b', epoch: 'epoch-1', revision: 'revision-1', origin: 'inline', format: 'html', body: '<h2 id="part">Current</h2><a href="story/a?variantId=b%3Ac#part" data-route="true">Other story</a>' })
    const selection = deferred<void>()
    vi.spyOn(test.session.selection, 'select').mockReturnValue(selection.promise)
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireDocs) } })
    await vi.waitFor(() => expect(wrapper.find('h2').exists()).toBe(true))
    const panel = wrapper.findComponent(HistoireDocs).element as HTMLElement
    panel.getBoundingClientRect = vi.fn().mockReturnValue({ top: 20 })
    panel.querySelector('h2')!.getBoundingClientRect = vi.fn().mockReturnValue({ top: 120 })
    await wrapper.get('a').trigger('click')
    selection.resolve()
    await selection.promise
    await Promise.resolve()
    expect(panel.scrollTop).toBe(0)
    wrapper.unmount()
    await test.session.dispose()
  })
})
