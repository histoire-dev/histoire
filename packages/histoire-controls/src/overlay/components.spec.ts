import type { HistoireControlsHost } from '@histoire/shared'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, toRaw, withDirectives } from 'vue'
import CustomSelect from '../components/select/CustomSelect.vue'
import { VTooltip } from './tooltip'

describe('host control overlays', () => {
  const handle = { id: 'overlay', update: vi.fn(), close: vi.fn() }
  const open = vi.fn().mockReturnValue(handle)

  beforeEach(() => {
    vi.clearAllMocks()
    window.__HST_CONTROLS_HOST__ = { open } as unknown as HistoireControlsHost
  })

  afterEach(() => {
    delete window.__HST_CONTROLS_HOST__
    vi.useRealTimers()
  })

  it('keeps option values local while selecting opaque IDs from the host', async () => {
    const value = { callback: () => 'local' }
    const wrapper = mount(CustomSelect, { props: {
      options: [{ value: undefined, label: 'Default' }, { value, label: 'Object' }],
    } })
    await wrapper.get('button').trigger('click')
    const [, overlay, onResult] = open.mock.calls[0]
    expect(overlay.items).toEqual([{ id: '0', label: 'Default' }, { id: '1', label: 'Object' }])
    await wrapper.setProps({ options: [{ value, label: 'Object' }, { value: undefined, label: 'Default' }] })
    expect(open.mock.results[0].value.update.mock.lastCall![0].items).toEqual([{ id: '1', label: 'Object' }, { id: '0', label: 'Default' }])
    onResult({ itemId: '1', restoreFocus: true })
    expect(toRaw(wrapper.emitted('update:modelValue')![0][0])).toBe(value)
    await wrapper.get('button').trigger('click')
    open.mock.lastCall![2]({ itemId: '0' })
    expect(wrapper.emitted('update:modelValue')![1]).toEqual([undefined])
    wrapper.unmount()
  })

  it('updates explicit tooltip feedback and removes its overlay on unmount', async () => {
    const content = ref('20')
    const wrapper = mount(defineComponent({
      setup: () => () => withDirectives(h('span'), [[VTooltip, { content: content.value, shown: true }]]),
    }))
    expect(open.mock.lastCall![1]).toMatchObject({ kind: 'tooltip', content: '20' })
    content.value = '42'
    await nextTick()
    expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ content: '42' }))
    wrapper.unmount()
    expect(handle.close).toHaveBeenCalledOnce()
  })

  it('cancels delayed hover tooltips when their element unmounts', async () => {
    vi.useFakeTimers()
    const wrapper = mount(defineComponent({
      setup: () => () => withDirectives(h('span'), [[VTooltip, 'Label']]),
    }))
    await nextTick()
    await wrapper.trigger('mouseenter')
    wrapper.unmount()
    vi.advanceTimersByTime(300)
    expect(open).not.toHaveBeenCalled()
  })
})
