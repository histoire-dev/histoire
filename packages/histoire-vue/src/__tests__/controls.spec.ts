import { HstNumber, HstText } from '@histoire/controls/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

describe('controls host Vue peer build', () => {
  it('updates host Vue refs in both directions without a vendor alias', async () => {
    const text = ref('before')
    const number = ref(3)
    const wrapper = mount(defineComponent({ render: () => h('div', [
      h(HstText, { 'title': 'Text', 'modelValue': text.value, 'onUpdate:modelValue': value => text.value = value }),
      h(HstNumber, { 'title': 'Number', 'modelValue': number.value, 'onUpdate:modelValue': value => number.value = value }),
    ]) }))
    await wrapper.find('input[type="text"]').setValue('edited')
    await wrapper.find('input[type="number"]').setValue('8')
    expect(text.value).toBe('edited')
    expect(number.value).toBe(8)
    text.value = 'from host'
    await wrapper.vm.$nextTick()
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('from host')
    wrapper.unmount()
  })
})
