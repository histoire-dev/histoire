import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HstSwitch from './HstSwitch.vue'

describe('boolean switch', () => {
  it('labels native switch and emits Boolean changes through pointer and Enter', async () => {
    const wrapper = mount(HstSwitch, { props: { title: 'Watch tests', modelValue: false } })
    try {
      const input = wrapper.get('input[role="switch"]')
      expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
      expect(input.attributes('aria-label')).toBe('Watch tests')
      await input.setValue(true)
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')).toEqual([[true], [true]])
      await wrapper.setProps({ disabled: true })
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    }
    finally { wrapper.unmount() }
  })
})
