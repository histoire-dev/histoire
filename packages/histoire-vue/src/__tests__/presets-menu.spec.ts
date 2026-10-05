import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { PresetMenu } from '../components/controls/PresetMenu.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('preset dropdown actions', () => {
  it('navigates actions, contains Enter in a caller form and restores trigger on Escape', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const action = vi.fn(async () => true)
    const submits = vi.fn((event: Event) => event.preventDefault())
    const wrapper = mount({ render: () => h('form', { onSubmit: submits }, h(HistoireProvider, { session }, () => h(PresetMenu, { selectedId: 'saved', selectedLabel: 'Saved', action }))) }, { attachTo: document.body })
    try {
      const trigger = wrapper.get('button[aria-label="Manage presets"]')
      await trigger.trigger('keydown', { key: 'ArrowDown' })
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Save preset'))
      const menu = wrapper.get('[role="menu"]')
      await menu.trigger('keydown', { key: 'ArrowDown' })
      expect(document.activeElement?.textContent).toBe('Rename preset')
      await menu.trigger('keydown', { key: 'End' })
      expect(document.activeElement?.textContent).toBe('Delete preset')
      await menu.trigger('keydown', { key: 'Home' })
      expect(document.activeElement?.textContent).toBe('Save preset')
      await wrapper.findAll('button').find(button => button.text() === 'Rename preset')!.trigger('click')
      const input = wrapper.get('input[aria-label="Preset name"]')
      await vi.waitFor(() => expect(document.activeElement).toBe(input.element))
      await input.setValue(' Changed ')
      await input.trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(action).toHaveBeenCalledWith({ action: 'rename', id: 'saved', label: 'Changed' }))
      expect(submits).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(trigger.element)
      await trigger.trigger('click')
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Save preset'))
      await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('retains failed draft, sends only one pending request and ignores retired completion focus', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const pending = deferred<boolean>()
    const action = vi.fn().mockResolvedValueOnce(false).mockReturnValueOnce(pending.promise)
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(PresetMenu, { selectedId: '', action }) }, attachTo: document.body })
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.findAll('button').some(button => button.text() === 'Save preset')).toBe(true))
      await wrapper.findAll('button').find(button => button.text() === 'Save preset')!.trigger('click')
      await wrapper.get('input[aria-label="Preset name"]').setValue('Draft')
      await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      expect(wrapper.get('button[aria-label="Manage presets"]').attributes('aria-expanded')).toBe('true')
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Draft')
      const save = wrapper.findAll('button').find(button => button.text() === 'Save')!
      await save.trigger('click')
      await save.trigger('click')
      expect(action).toHaveBeenCalledTimes(2)
      expect(save.attributes('disabled')).toBeDefined()
      wrapper.unmount()
      outside.focus()
      pending.resolve(true)
      await pending.promise
      expect(document.activeElement).toBe(outside)
    }
    finally {
      pending.resolve(true)
      if (wrapper.exists()) wrapper.unmount()
      outside.remove()
      await session.dispose()
    }
  })
})
