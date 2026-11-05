import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'
import OutputLog from '../../../../histoire-app/src/app/components/marketplace/install/OutputLog.vue'

// jsdom has no geometry: substitute only scroll metrics, exercise actual scroll
// handler and prop lifecycle. New output must not steal a user's reading position.
it('follows new output only while user remains at bottom', async () => {
  const wrapper = mount(OutputLog, { props: { output: ['Resolving'] } })
  try {
    const element = wrapper.get('pre').element
    let height = 500
    Object.defineProperties(element, { scrollHeight: { get: () => height }, clientHeight: { value: 100 } })
    await wrapper.setProps({ output: ['Resolving', 'Installing'] })
    await nextTick()
    expect(element.scrollTop).toBe(500)
    element.scrollTop = 100
    await wrapper.get('pre').trigger('scroll')
    height = 600
    await wrapper.setProps({ output: ['Resolving', 'Installing', 'Writing config'] })
    await nextTick()
    expect(element.scrollTop).toBe(100)
    element.scrollTop = 500
    await wrapper.get('pre').trigger('scroll')
    height = 700
    await wrapper.setProps({ output: ['Restarting'] })
    await nextTick()
    expect(element.scrollTop).toBe(700)
  }
  finally { wrapper.unmount() }
})
