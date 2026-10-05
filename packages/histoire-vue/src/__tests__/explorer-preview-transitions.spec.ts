import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { ExplorerPreview } from '../components/explorer/ExplorerPreview.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('explorer teardown transition ownership', () => {
  it.each([false, true])('joins pending close after docs intent; latest story arrives before close: %s', async (returnBeforeClose) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const target = { storyId: 'a:b', variantId: 'c' }
    await session.selection.select(target)
    const closed = deferred<void>()
    const errors: unknown[] = []
    const wrapper = mount(HistoireProvider, { props: { session, onError: error => errors.push(error) }, slots: { default: () => h(ExplorerPreview) } })
    try {
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      fixture.surfaceClose.mockImplementationOnce(() => closed.promise)
      await wrapper.get('[aria-label="Show variant grid"]').trigger('click')
      await session.selection.select({ storyId: 'docs' })
      await nextTick()
      if (returnBeforeClose) {
        await session.selection.select(target)
        await nextTick()
      }
      expect(fixture.adapters.mount).toHaveBeenCalledOnce()
      expect(() => session.mount(document.createElement('div'), { surface: 'preview' })).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
      closed.resolve()
      await vi.waitFor(() => expect(fixture.adapters.mount).toHaveBeenCalledTimes(2))
      expect(fixture.adapters.mount.mock.calls[1][0].surface).toBe('preview')
      if (!returnBeforeClose) {
        await vi.waitFor(() => expect(wrapper.find('[aria-label="Histoire documentation"]').exists()).toBe(true))
        await session.selection.select(target)
      }
      await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
      expect(session.getSnapshot().selection).toEqual(target)
      expect(fixture.adapters.mount).toHaveBeenCalledTimes(2)
      expect(fixture.surfaceClose).toHaveBeenCalledOnce()
      expect(() => session.mount(document.createElement('div'), { surface: 'grid' })).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
      expect(errors).toEqual([])
    }
    finally {
      closed.resolve()
      wrapper.unmount()
      await session.dispose()
    }
  })
})
