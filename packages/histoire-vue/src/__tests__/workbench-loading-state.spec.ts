import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkbenchLoadingState from '../../../histoire-app/src/app/components/shell/WorkbenchLoadingState.vue'

describe('workbench loading status', () => {
  it('announces operation and optional detail while keeping animation decorative', async () => {
    const wrapper = mount(WorkbenchLoadingState, {
      props: { title: 'Collecting tests…' },
      slots: { default: 'Waiting for test definitions' },
    })
    try {
      const status = wrapper.get('[role="status"]')
      expect(status.attributes('aria-atomic')).toBe('true')
      expect(status.text()).toBe('Collecting tests…Waiting for test definitions')
      expect(status.get('[aria-hidden="true"]').text()).toBe('')
      await wrapper.setProps({ title: 'Running tests…' })
      expect(status.text()).toContain('Running tests…')
    }
    finally { wrapper.unmount() }
  })
})
