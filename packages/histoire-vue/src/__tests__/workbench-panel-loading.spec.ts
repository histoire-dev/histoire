import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import AgentsSection from '../../../histoire-app/src/app/components/pages/settings/AgentsSection.vue'
import { createAgentsStore, provideAgentsStore } from '../../../histoire-app/src/app/stores/agents.js'

vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))

describe('agent settings connection loading', () => {
  it('replaces pending connection with no-agents message without hiding settings', async () => {
    const agents = createAgentsStore()
    const host = defineComponent({
      /** Settings retain their genuine provider-owned store. */
      setup() {
        provideAgentsStore(agents)
        return () => h(AgentsSection)
      },
    })
    const wrapper = mount(host)
    try {
      expect(wrapper.get('[role="status"][aria-atomic="true"]').text()).toBe('Connecting to dev server')
      expect(wrapper.find('[aria-label="Enable local agents"]').exists()).toBe(true)
      agents.connected.value = true
      await nextTick()
      expect(wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('No agents configured')
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })
})
