import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireEvents } from '../components/events/HistoireEvents.js'
import { HistoireSearch } from '../components/search/HistoireSearch.js'
import { HistoireToolbar } from '../components/toolbar/HistoireToolbar.js'
import { HistoireStoryTree } from '../components/tree/HistoireStoryTree.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('native actions inside caller forms', () => {
  it('changes session settings/selection and clears events without submitting host form', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const submits = vi.fn((event: Event) => event.preventDefault())
    const clear = vi.spyOn(session.events, 'clear')
    const wrapper = mount({ render: () => h('form', { onSubmit: submits }, h(HistoireProvider, { session }, () => [h(HistoireToolbar), h(HistoireStoryTree), h(HistoireEvents)])) }, { attachTo: document.body })
    try {
      ;(wrapper.findAll('button').find(button => button.text() === 'Rotate')!.element as HTMLButtonElement).click()
      expect(session.getSnapshot().settings.rotate).toBe(true)
      ;(wrapper.get('button[aria-label="First / Two"]').element as HTMLButtonElement).click()
      await vi.waitFor(() => expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' }))
      ;(wrapper.findAll('button').find(button => button.text() === 'Clear events')!.element as HTMLButtonElement).click()
      expect(clear).toHaveBeenCalledOnce()
      expect(submits).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('keeps search Enter inside panel even when no matches can activate', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    fixture.request.mockResolvedValue([])
    const submits = vi.fn((event: Event) => event.preventDefault())
    const select = vi.spyOn(session.selection, 'select')
    const wrapper = mount({ render: () => h('form', { onSubmit: submits }, h(HistoireProvider, { session }, () => h(HistoireSearch))) }, { attachTo: document.body })
    try {
      await wrapper.get('input').setValue('Missing')
      await vi.waitFor(() => expect(wrapper.text()).toContain('No matches'))
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      wrapper.get('input').element.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(true)
      expect(select).not.toHaveBeenCalled()
      expect(submits).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
