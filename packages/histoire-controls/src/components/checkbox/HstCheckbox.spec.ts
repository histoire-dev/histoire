import { mount } from '@vue/test-utils'
import HstCheckbox from './HstCheckbox.vue'

describe('hstCheckbox', () => {
  it('exposes current boolean state and preserves string models during keyboard toggle', async () => {
    const wrapper = mount(HstCheckbox, { props: { title: 'Extra controls', modelValue: true } })
    try {
      const checkbox = wrapper.get('[role="checkbox"]')
      expect(checkbox.attributes('aria-checked')).toBe('true')
      await wrapper.setProps({ modelValue: 'false' })
      expect(checkbox.attributes('aria-checked')).toBe('false')
      await checkbox.trigger('keydown', { key: ' ' })
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['true'])
    }
    finally {
      wrapper.unmount()
    }
  })

  it('toggle to checked', async () => {
    const wrapper = mount(HstCheckbox, {
      props: {
        modelValue: false,
        title: 'Label',
      },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([true])
  })

  it('toggle to unchecked', async () => {
    const wrapper = mount(HstCheckbox, {
      props: {
        modelValue: true,
        title: 'Label',
      },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
})
