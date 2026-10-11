import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import VisualTestsSummary from '../../../histoire-app/src/app/components/panes/visual/VisualTestsSummary.vue'

it('announces active comparison progress instead of stale evidence until run stops', async () => {
  const wrapper = mount(VisualTestsSummary, {
    props: { counts: { passed: 0, stale: 12, changed: 0, missing: 0, incompatible: 0, error: 0, cancelled: 0 }, running: false, completed: 0, total: 12, stale: true },
  })
  try {
    expect(wrapper.text()).toContain('Source changed, run again to approve')
    await wrapper.setProps({ running: true, completed: 3 })
    expect(wrapper.get('[role="status"]').text()).toBe('Comparing images… 3 of 12')
    expect(wrapper.text()).not.toContain('Source changed, run again to approve')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('3')
    await wrapper.setProps({ completed: 7 })
    expect(wrapper.get('[role="status"]').text()).toBe('Comparing images… 7 of 12')
    await wrapper.setProps({ running: false })
    expect(wrapper.text()).toContain('Source changed, run again to approve')
    expect(wrapper.text()).not.toContain('Comparing images…')
  }
  finally { wrapper.unmount() }
})
