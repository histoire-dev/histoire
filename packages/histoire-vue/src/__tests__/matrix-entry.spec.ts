import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ArrangeSwitch from '../../../histoire-app/src/app/components/canvas/toolbar/ArrangeSwitch.vue'

describe('matrix arrangement entry', () => {
  it('opens matrix without requiring discovered prop axes', async () => {
    const wrapper = mount(ArrangeSwitch, { props: { arrange: 'grid' } })
    try {
      const button = wrapper.get('button[aria-label="Props matrix"]')
      expect((button.element as HTMLButtonElement).disabled).toBe(false)
      await button.trigger('click')
      expect(wrapper.emitted('arrange')).toEqual([['matrix']])
      await wrapper.setProps({ arrange: 'matrix' })
      expect(button.attributes('aria-pressed')).toBe('true')
    }
    finally { wrapper.unmount() }
  })
})
