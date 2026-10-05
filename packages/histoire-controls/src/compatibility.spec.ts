import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BaseButton from '../../histoire-app/src/app/components/base/BaseButton.vue'
import BaseCheckbox from '../../histoire-app/src/app/components/base/BaseCheckbox.vue'
import BaseSelect from '../../histoire-app/src/app/components/base/BaseSelect.vue'

describe('legacy control adapters', () => {
  it('retains link destination and checkbox slot label interaction', async () => {
    const link = mount(BaseButton, { props: { href: '/docs' }, attrs: { 'aria-label': 'Docs' }, slots: { default: 'Docs' } })
    const checkbox = mount(BaseCheckbox, { props: { modelValue: false }, slots: { default: 'Available' } })
    try {
      expect(link.get('a').attributes('href')).toBe('/docs')
      expect(link.find('button').exists()).toBe(false)
      await checkbox.get('[role="checkbox"]').trigger('click')
      expect(checkbox.emitted('update:modelValue')).toEqual([[true]])
      expect(checkbox.text()).toBe('Available')
    }
    finally {
      link.unmount()
      checkbox.unmount()
    }
  })

  it('retains selected-label slot and both existing select events', async () => {
    const open = vi.fn()
    window.__HST_CONTROLS_HOST__ = { open } as any
    const wrapper = mount(BaseSelect, { props: { modelValue: 'one', options: { one: 'One', two: 'Two' } }, slots: { default: ({ label }) => `Chosen ${label}` } })
    try {
      expect(wrapper.get('button').text()).toBe('Chosen One')
      await wrapper.get('button').trigger('click')
      open.mock.lastCall![2]({ itemId: '1', restoreFocus: false })
      expect(wrapper.emitted('update:modelValue')).toEqual([['two']])
      expect(wrapper.emitted('select')).toEqual([['two']])
    }
    finally {
      wrapper.unmount()
      delete window.__HST_CONTROLS_HOST__
    }
  })
})
