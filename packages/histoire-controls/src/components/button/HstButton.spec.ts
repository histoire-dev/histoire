import { mount } from '@vue/test-utils'
import { h } from 'vue'
import HstButton from './HstButton.vue'

describe('control button host form ownership', () => {
  it.each([undefined, 'submit'])('submits caller form only when requested type=%s', (type) => {
    const submits = vi.fn((event: Event) => event.preventDefault())
    const click = vi.fn()
    const wrapper = mount({ render: () => h('form', { onSubmit: submits }, h(HstButton, { ...(type ? { type } : {}), onClick: click }, () => 'Action')) }, { attachTo: document.body })
    try {
      ;(wrapper.get('button').element as HTMLButtonElement).click()
      expect(click).toHaveBeenCalledOnce()
      expect(submits).toHaveBeenCalledTimes(type === 'submit' ? 1 : 0)
    }
    finally {
      wrapper.unmount()
    }
  })
})
