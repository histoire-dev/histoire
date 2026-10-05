import type { HistoirePresetList } from '@histoire/sdk/internal'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { StatePresets } from '../components/controls/StatePresets.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { controlSelect, selectControl, selectLabels } from './fixtures/select.js'

describe('preset operation publication ownership', () => {
  it.each(['apply', 'reset'] as const)('retires pending %s on source publication without clearing document presets', async (action) => {
    const fixture = sourceFixture()
    const wait = deferred<HistoirePresetList | ReturnType<typeof fixture.state>>()
    const dispatch = fixture.request.getMockImplementation()!
    let delay = false
    fixture.request.mockImplementation((command, payload) => {
      if (command === 'controls.preset') {
        if (payload.action === 'list') return Promise.resolve({ items: [{ id: 'saved', label: 'Saved' }] })
        if (delay) return wait.promise
        return Promise.resolve({ items: [{ id: 'saved', label: 'Saved' }], selectedId: payload.id })
      }
      if (delay && command === 'state.reset') return wait.promise
      return dispatch(command, payload)
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const errors = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session, onError: errors }, slots: { default: () => h(StatePresets) } })
    try {
      await vi.waitFor(() => expect(controlSelect(wrapper).props('options')).toHaveLength(2))
      if (action === 'reset') {
        await selectControl(wrapper, 'saved')
        await vi.waitFor(() => expect(controlSelect(wrapper).props('modelValue')).toBe('saved'))
        await vi.waitFor(() => expect(controlSelect(wrapper).props('disabled')).toBe(false))
      }
      const accepted = action === 'apply' ? '' : 'saved'
      delay = true
      await selectControl(wrapper, action === 'apply' ? 'saved' : '')
      await vi.waitFor(() => expect(fixture.request).toHaveBeenLastCalledWith(action === 'apply' ? 'controls.preset' : 'state.reset', action === 'apply' ? { action: 'apply', id: 'saved' } : {}, expect.anything()))
      expect(controlSelect(wrapper).props('modelValue')).toBe(accepted)
      const previous = session.getSnapshot().runtime
      fixture.descriptor.revision = 'revision-2'
      fixture.emitCatalog()
      await flushPromises()
      expect(session.getSnapshot().runtime).toEqual(previous)
      expect(errors).not.toHaveBeenCalled()
      expect(selectLabels(wrapper)).toEqual(['Initial state', 'Saved'])
      expect(controlSelect(wrapper).props('modelValue')).toBe(accepted)
      expect(controlSelect(wrapper).props('disabled')).toBe(false)
      wait.resolve(action === 'apply' ? { items: [{ id: 'late', label: 'Late' }], selectedId: 'late' } : fixture.state())
      await flushPromises()
      expect(selectLabels(wrapper)).toEqual(['Initial state', 'Saved'])
      expect(controlSelect(wrapper).props('modelValue')).toBe(accepted)
    }
    finally {
      wait.resolve(fixture.state())
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('retains acknowledged preset after current apply failure and reports that failure', async () => {
    const fixture = sourceFixture()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => {
      if (command === 'controls.preset') {
        if (payload.action === 'list') return Promise.resolve({ items: [{ id: 'saved', label: 'Saved' }] })
        return Promise.reject(new Error('Preset unavailable'))
      }
      return dispatch(command, payload)
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    const errors = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session, onError: errors }, slots: { default: () => h(StatePresets) } })
    try {
      await vi.waitFor(() => expect(controlSelect(wrapper).props('options')).toHaveLength(2))
      await selectControl(wrapper, 'saved')
      await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce())
      expect(controlSelect(wrapper).props('modelValue')).toBe('')
      expect(controlSelect(wrapper).props('disabled')).toBe(false)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
