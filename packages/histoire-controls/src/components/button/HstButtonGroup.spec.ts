import { mount } from '@vue/test-utils'
import HstButtonGroup from './HstButtonGroup.vue'

describe('finite control option labels', () => {
  it('retains full accessible label and title while emitting only the option token', async () => {
    const label = 'x'.repeat(500)
    const wrapper = mount(HstButtonGroup, { props: { modelValue: 'short', options: [{ value: 'long', label }] } })
    try {
      const option = wrapper.get('button')
      expect(option.attributes('aria-label')).toBe(label)
      expect(option.attributes('title')).toBe(label)
      expect(option.text()).toBe(label)
      await option.trigger('click')
      expect(wrapper.emitted('update:modelValue')).toEqual([['long']])
    }
    finally {
      wrapper.unmount()
    }
  })
})
