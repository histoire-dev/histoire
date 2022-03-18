import { mount } from '@vue/test-utils'
import HstCheckbox from './HstCheckbox.vue'

describe('HstCheckbox', () => {
  test('toggle to checked', async () => {
    const wrapper = mount(HstCheckbox, {
      props: {
        modelValue: false,
        title: 'Label',
      },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([true])
    expect(wrapper.html()).toMatchSnapshot()
  })

  test('toggle to unchecked', async () => {
    const wrapper = mount(HstCheckbox, {
      props: {
        modelValue: true,
        title: 'Label',
      },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
    expect(wrapper.html()).toMatchSnapshot()
  })
})
