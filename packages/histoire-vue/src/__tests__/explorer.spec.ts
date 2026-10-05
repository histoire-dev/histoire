import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireExplorer } from '../components/explorer/HistoireExplorer.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { selectControl } from './fixtures/select.js'

describe('shared Explorer composition', () => {
  it('switches selected variant directly while retaining one owned primary', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].variants.push({ id: 'second', title: 'Second variant' })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }) } })
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      await selectControl(wrapper, 'second', 'Variant')
      await vi.waitFor(() => expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'second' }))
      expect(fixture.adapters.mount).toHaveBeenCalledOnce()
      expect(fixture.surfaceClose).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('invalidates delayed layout change when newer docs selection keeps current wrapper', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[1].layout = { type: 'grid' }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const accepted = deferred<void>()
    const dispatch = fixture.request.getMockImplementation()!
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }) } })
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      fixture.request.mockImplementationOnce(async (command, payload) => {
        await accepted.promise
        return dispatch(command, payload)
      })
      const old = expect(session.selection.select({ storyId: 'a', variantId: 'b:c' })).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
      await Promise.resolve()
      await session.selection.select({ storyId: 'docs' })
      accepted.resolve()
      await old
      await vi.waitFor(() => expect(wrapper.find('[aria-label="Histoire documentation"]').exists()).toBe(true))
      expect(fixture.surfaceClose).not.toHaveBeenCalled()
      expect(fixture.adapters.mount).toHaveBeenCalledOnce()
    }
    finally {
      accepted.resolve()
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('defers automatic grid replacement until original selection ACK settles', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[1].layout = { type: 'grid' }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const errors: unknown[] = []
    const wrapper = mount(HistoireProvider, { props: { session, onError: error => errors.push(error) }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }) } })
    const accepted = deferred<void>()
    const dispatch = fixture.request.getMockImplementation()!
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      fixture.request.mockImplementationOnce(async (command, payload) => {
        await accepted.promise
        return dispatch(command, payload)
      })
      const selecting = session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await Promise.resolve()
      expect(fixture.surfaceClose).not.toHaveBeenCalled()
      accepted.resolve()
      await selecting
      await vi.waitFor(() => expect(fixture.adapters.mount).toHaveBeenCalledTimes(2))
      expect(fixture.adapters.mount.mock.calls[1][0].surface).toBe('grid')
      expect(errors).toEqual([])
    }
    finally {
      accepted.resolve()
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('retains idle primary reservation across docs-only selection without cancelling selection ACK', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories.push({ id: 'docs-extra', title: 'Documentation', path: ['Documentation'], docsOnly: true, variants: [], content: { docs: true, rawSource: false } })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const errors: unknown[] = []
    const wrapper = mount(HistoireProvider, { props: { session, onError: error => errors.push(error) }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }) } })
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      await session.selection.select({ storyId: 'docs-extra' })
      await vi.waitFor(() => expect(wrapper.find('[aria-label="Histoire documentation"]').exists()).toBe(true))
      await session.selection.select({ storyId: 'a:b', variantId: 'c' })
      expect(fixture.adapters.mount).toHaveBeenCalledOnce()
      expect(fixture.surfaceClose).not.toHaveBeenCalled()
      expect(() => session.mount(document.createElement('div'), { surface: 'preview' })).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
      expect(errors).toEqual([])
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('leaves custom preview ownership to slot and visibility suppresses independent parts', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }, {
      preview: ({ session: explicit, snapshot }) => h('button', { onClick: () => explicit.settings.update({ colorScheme: 'dark' }) }, snapshot.selection.storyId),
    }) } })
    try {
      expect(fixture.adapters.mount).not.toHaveBeenCalled()
      expect(wrapper.findAll('input, nav, select')).toHaveLength(0)
      await wrapper.get('button').trigger('click')
      expect(session.getSnapshot().settings.colorScheme).toBe('dark')
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('joins preview teardown before grid replacement and keeps caller session alive', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const closed = deferred<void>()
    const errors: unknown[] = []
    const wrapper = mount(HistoireProvider, { props: { session, onError: error => errors.push(error) }, slots: { default: () => h(HistoireExplorer, { showNavigation: false, showSearch: false, showToolbar: false, showPanels: false }) } })
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      fixture.surfaceClose.mockImplementationOnce(() => closed.promise)
      await wrapper.get('[aria-label="Show variant grid"]').trigger('click')
      expect(fixture.adapters.mount).toHaveBeenCalledOnce()
      expect(session.getSnapshot().runtime.status).toBe('absent')
      closed.resolve()
      await vi.waitFor(() => expect(fixture.adapters.mount).toHaveBeenCalledTimes(2))
      expect(fixture.adapters.mount.mock.calls[1][0].surface).toBe('grid')
      expect(errors).toEqual([])
    }
    finally {
      closed.resolve()
      wrapper.unmount()
      await vi.waitFor(() => expect(fixture.surfaceClose).toHaveBeenCalledTimes(2))
      expect(session.getSnapshot().status).toBe('ready')
      await session.dispose()
    }
  })
})
