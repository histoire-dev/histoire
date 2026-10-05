import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { wrapControlComponent } from '../../histoire-plugin-vue/src/client/app/control-component'
import HstCheckbox from './components/checkbox/HstCheckbox.vue'
import HstSelect from './components/select/HstSelect.vue'
import HstText from './components/text/HstText.vue'

vi.mock('@histoire/vendors/vue', () => import('vue'))

describe('vue story control bridge', () => {
  it('retains absent slots and fallback selected label', async () => {
    const checkbox = mount(wrapControlComponent(HstCheckbox), { attrs: { title: 'Enabled', modelValue: true } })
    const select = mount(wrapControlComponent(HstSelect), { attrs: { title: 'Choice', modelValue: 1, options: [1, 2] } })
    try {
      await nextTick()
      expect(checkbox.text()).toBe('Enabled')
      expect(select.get('button').text()).toBe('1')
    }
    finally {
      checkbox.unmount()
      select.unmount()
    }
  })

  it('transports supplied selected-label and option slots', async () => {
    const wrapper = mount(wrapControlComponent(HstSelect), { attachTo: document.body, attrs: { title: 'Choice', modelValue: 1, options: [1, 2] }, slots: { default: ({ label }) => `Chosen ${label}`, option: ({ label }) => `Pick ${label}` } })
    try {
      await nextTick()
      await vi.waitFor(() => expect(wrapper.get('button').text()).toBe('Chosen 1'))
      await wrapper.get('button').trigger('click')
      await vi.waitFor(() => expect([...document.querySelectorAll('[role="option"]')].map(option => option.textContent?.trim())).toEqual(['Pick 1', 'Pick 2']))
    }
    finally { wrapper.unmount() }
  })

  it('keeps labels unique across adapter-owned Vue apps and exposes native focus', () => {
    const first = mount(wrapControlComponent(HstText), { attachTo: document.body, attrs: { title: 'First' } })
    const second = mount(wrapControlComponent(HstText), { attachTo: document.body, attrs: { title: 'Second' } })
    try {
      expect(first.get('input').attributes('id')).not.toBe(second.get('input').attributes('id'))
      expect(first.get('label').element.control).toBe(first.get('input').element)
      expect(second.get('label').element.control).toBe(second.get('input').element)
      ;(second.vm as any).focus()
      expect(document.activeElement).toBe(second.get('input').element)
    }
    finally {
      first.unmount()
      second.unmount()
    }
  })
})
