import type { HistoirePresetAction } from '@histoire/sdk/internal'
import { createHistoireSessionWithAdapters, registerHistoireSessionInternals } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireControls } from '../components/controls/HistoireControls.js'
import { StatePresets } from '../components/controls/StatePresets.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { controlSelect, selectControl, selectLabels } from './fixtures/select.js'

describe('native controls state ownership', () => {
  it.each([true, false])('cleans failed readiness and suppresses stale failure after removal=%s', async (removed) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    registerHistoireSessionInternals(session, { descriptor: () => fixture.descriptor, presets: async () => ({ items: [] }) })
    const ready = deferred<void>()
    const close = vi.fn(async () => {
    })
    const child = { id: 'child', surface: 'controls' as const, ready: ready.promise, unmount: close }
    const mountChild = vi.spyOn(session, 'mount').mockReturnValue(child)
    const error = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session, onError: error }, slots: { default: () => h(HistoireControls) } })
    await vi.waitFor(() => expect(mountChild).toHaveBeenCalledOnce())
    if (removed) {
      wrapper.unmount()
    }
    ready.reject(new Error('controls setup failed'))
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(error).toHaveBeenCalledTimes(removed ? 0 : 1)
    if (!removed) {
      expect(wrapper.get('[role="alert"]').text()).toBe('Custom controls unavailable: controls setup failed')
      const recoveredClose = vi.fn(async () => {})
      mountChild.mockReturnValue({ ...child, ready: Promise.resolve(), unmount: recoveredClose })
      await wrapper.findAll('button').find(button => button.text() === 'Retry controls')!.trigger('click')
      await vi.waitFor(() => expect(mountChild).toHaveBeenCalledTimes(2))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      wrapper.unmount()
      expect(recoveredClose).toHaveBeenCalledOnce()
    }
    expect(close).toHaveBeenCalledOnce()
    expect(session.getSnapshot().runtime.mountId).toBe(primary.id)
    mountChild.mockRestore()
    await session.dispose()
  })
  it.each([true, false])('retains document-owned preset choices across unrelated state publications with compact=%s', async (compact) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    let items = [{ id: 'preset', label: 'Saved' }]
    const presets = vi.fn(async (input: HistoirePresetAction) => {
      if (input.action === 'save') items = [...items, { id: 'new-preset', label: input.label }]
      if (input.action === 'rename') items = items.map(item => item.id === input.id ? { ...item, label: input.label } : item)
      if (input.action === 'delete') items = items.filter(item => item.id !== input.id)
      return { items, ...(input.action === 'save' ? { selectedId: 'new-preset' } : input.action === 'apply' ? { selectedId: input.id } : {}) }
    })
    registerHistoireSessionInternals(session, { descriptor: () => fixture.descriptor, presets })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(StatePresets, { compact }) } })
    const labels = compact ? ['Preset: Initial state', 'Preset: Saved'] : ['Initial state', 'Saved']
    await vi.waitFor(() => expect(selectLabels(wrapper)).toEqual(labels))
    await session.state.patch({ count: 8 })
    expect(selectLabels(wrapper)).toEqual(labels)
    expect(presets).toHaveBeenCalledOnce()
    await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('button').some(button => button.text() === 'Save preset')).toBe(true))
    expect(wrapper.findAll('button').find(button => button.text() === 'Rename preset')!.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('button').find(button => button.text() === 'Delete preset')!.attributes('disabled')).toBeDefined()
    expect(wrapper.find('input[aria-label="Preset name"]').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === 'Save preset')!.trigger('click')
    await wrapper.get('input[aria-label="Preset name"]').setValue('New preset')
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    await vi.waitFor(() => expect(presets).toHaveBeenLastCalledWith({ action: 'save', label: 'New preset' }))
    await vi.waitFor(() => expect(controlSelect(wrapper).props('modelValue')).toBe('new-preset'))
    await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Rename preset')!.trigger('click')
    expect((wrapper.get('input[aria-label="Preset name"]').element as HTMLInputElement).value).toBe('New preset')
    await wrapper.get('input[aria-label="Preset name"]').setValue('Renamed')
    await wrapper.findAll('button').find(button => button.text() === 'Rename')!.trigger('click')
    await vi.waitFor(() => expect(presets).toHaveBeenLastCalledWith({ action: 'rename', id: 'new-preset', label: 'Renamed' }))
    await vi.waitFor(() => expect(wrapper.get('button[aria-label="Manage presets"]').attributes('aria-expanded')).toBe('false'))
    expect(controlSelect(wrapper).props('modelValue')).toBe('new-preset')
    await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Delete preset')!.trigger('click')
    await vi.waitFor(() => expect(presets).toHaveBeenLastCalledWith({ action: 'delete', id: 'new-preset' }))
    await vi.waitFor(() => expect(controlSelect(wrapper).props('modelValue')).toBe(''))
    expect(selectLabels(wrapper)).toEqual(labels)
    await selectControl(wrapper, 'preset')
    await vi.waitFor(() => expect(presets).toHaveBeenLastCalledWith({ action: 'apply', id: 'preset' }))
    const reset = vi.spyOn(session.state, 'reset')
    await selectControl(wrapper, '')
    await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce())
    wrapper.unmount()
    await session.dispose()
  })
  it('routes external Reset state through preset owner and retires an overtaken acknowledgment', async () => {
    const fixture = sourceFixture()
    const reset = deferred<ReturnType<typeof fixture.state>>()
    const dispatch = fixture.request.getMockImplementation()!
    let delayed = false
    fixture.request.mockImplementation((command, payload) => {
      if (command === 'controls.preset') {
        if (payload.action === 'list') return Promise.resolve({ items: [{ id: 'saved', label: 'Saved' }] })
        return Promise.resolve({ items: [{ id: 'saved', label: 'Saved' }], selectedId: payload.id })
      }
      if (command === 'state.reset' && delayed) return reset.promise
      return dispatch(command, payload)
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    registerHistoireSessionInternals(session, { descriptor: () => fixture.descriptor, presets: async input => fixture.request('controls.preset', input) as any })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireControls) } })
    try {
      await vi.waitFor(() => expect(selectLabels(wrapper)).toEqual(['Initial state', 'Saved']))
      await selectControl(wrapper, 'saved', 'State preset')
      await vi.waitFor(() => expect(controlSelect(wrapper, 'State preset').props('modelValue')).toBe('saved'))
      await wrapper.get('.histoire-controls-reset').trigger('click')
      await vi.waitFor(() => expect(controlSelect(wrapper, 'State preset').props('modelValue')).toBe(''))
      await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.findAll('button').find(button => button.text() === 'Rename preset')?.attributes('disabled')).toBeDefined())
      expect(wrapper.findAll('button').find(button => button.text() === 'Delete preset')?.attributes('disabled')).toBeDefined()
      await wrapper.get('button[aria-label="Manage presets"]').trigger('click')
      await selectControl(wrapper, 'saved', 'State preset')
      await vi.waitFor(() => expect(controlSelect(wrapper, 'State preset').props('modelValue')).toBe('saved'))
      delayed = true
      await wrapper.get('.histoire-controls-reset').trigger('click')
      await vi.waitFor(() => expect(fixture.request).toHaveBeenLastCalledWith('state.reset', {}, expect.anything()))
      fixture.descriptor.revision = 'replacement'
      fixture.emitCatalog()
      reset.resolve(fixture.state())
      await reset.promise
      await vi.waitFor(() => expect(controlSelect(wrapper, 'State preset').props('modelValue')).toBe('saved'))
    }
    finally {
      reset.resolve(fixture.state())
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('disables external Reset state until preset-list ownership is ready', async () => {
    const fixture = sourceFixture()
    const list = deferred<{ items: { id: string, label: string }[] }>()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount(document.createElement('div'), { surface: 'preview' }).ready
    registerHistoireSessionInternals(session, { descriptor: () => fixture.descriptor, presets: async input => input.action === 'list' ? list.promise : { items: [] } })
    const reset = vi.spyOn(session.state, 'reset')
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireControls) } })
    try {
      await vi.waitFor(() => expect(wrapper.get('.histoire-controls-reset').attributes('disabled')).toBeDefined())
      await session.state.patch({ count: 8 })
      await wrapper.get('.histoire-controls-reset').trigger('click')
      expect(reset).not.toHaveBeenCalled()
      expect(session.getSnapshot().state?.value).toMatchObject({ count: 8 })
      list.resolve({ items: [] })
      await vi.waitFor(() => expect(wrapper.get('.histoire-controls-reset').attributes('disabled')).toBeUndefined())
      await wrapper.get('.histoire-controls-reset').trigger('click')
      await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(session.getSnapshot().state?.value).toMatchObject({ count: 5 }))
    }
    finally {
      list.resolve({ items: [] })
      wrapper.unmount()
      await session.dispose()
    }
  })
  it('does not mount story controls or edit state without ready primary', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireControls) } })
    expect(wrapper.text()).toContain('Preview unavailable')
    expect(fixture.adapters.mount).not.toHaveBeenCalled()
    wrapper.unmount()
    await session.dispose()
  })
  it('routes generic edits to primary and never claims primary through controls mount', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    await session.state.get()
    fixture.descriptor.capabilities.surfaces.controls = { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
    const controlsMount = vi.spyOn(session, 'mount').mockImplementation(() => {
      throw new Error('Custom surface not supplied by test source')
    })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireControls) } })
    const input = wrapper.find('input[type=number]')
    await input.setValue('12')
    await vi.waitFor(() => expect(session.getSnapshot().state?.value).toMatchObject({ count: 12 }))
    expect(session.getSnapshot().runtime.mountId).toBe(primary.id)
    wrapper.unmount()
    controlsMount.mockRestore()
    await session.dispose()
  })
})
