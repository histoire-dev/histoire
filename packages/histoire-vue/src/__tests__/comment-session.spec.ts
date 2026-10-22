import type { UiAgentConfigOptions } from '@histoire/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionPicker from '../../../histoire-app/src/app/components/comments/prompt/SessionPicker.vue'
import SessionSettings from '../../../histoire-app/src/app/components/comments/prompt/SessionSettings.vue'
import { readyAgents } from './utils/comment-prompt.js'

const config: UiAgentConfigOptions = {
  agentId: 'claude',
  model: { configId: 'model', currentValue: 'opus', options: [{ value: 'opus', label: 'Opus 5.5' }, { value: 'sonnet', label: 'Sonnet 5.5' }] },
  effort: { configId: 'effort', currentValue: 'high', options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] },
  mode: { configId: 'mode', currentValue: 'auto', options: [{ value: 'plan', label: 'Plan' }, { value: 'auto', label: 'Auto' }] },
}
const stubs = { BuiltinIcon: true, AgentLogo: true }

describe('agent session chip', () => {
  it('summarizes the chosen model and effort, falling back to the agent defaults', async () => {
    const wrapper = mount(SessionPicker, { props: { agents: readyAgents, agentId: 'claude', config, options: {} }, global: { stubs } })
    try {
      const chip = wrapper.get('button[aria-haspopup="dialog"]')
      expect(chip.text()).toBe('Opus 5.5 · High')
      await wrapper.setProps({ options: { model: 'sonnet', effort: 'low' } })
      expect(chip.text()).toBe('Sonnet 5.5 · Low')
      await wrapper.setProps({ config: undefined })
      expect(chip.text()).toBe('Claude Code')
    }
    finally { wrapper.unmount() }
  })
})

describe('agent session settings', () => {
  it('picks model, effort and mode, resetting effort when the model changes', async () => {
    const wrapper = mount(SessionSettings, { props: { agents: readyAgents, agentId: 'claude', config, options: { effort: 'low' } }, global: { stubs } })
    try {
      await wrapper.get('[role="radio"][aria-label="Sonnet 5.5"]').trigger('click')
      await wrapper.get('[role="radio"][aria-label="Plan"]').trigger('click')
      await wrapper.get('[aria-label="Reasoning effort"] button[aria-label="High"]').trigger('click')
      expect(wrapper.emitted('update:options')).toEqual([[{ model: 'sonnet' }], [{ effort: 'low', mode: 'plan' }], [{ effort: 'high' }]])
      expect(wrapper.get('[role="radio"][aria-label="Opus 5.5"]').attributes('aria-checked')).toBe('true')
    }
    finally { wrapper.unmount() }
  })

  it('only offers switching agents while the conversation is not bound', async () => {
    const wrapper = mount(SessionSettings, { props: { agents: readyAgents, agentId: 'claude', config, options: {} }, global: { stubs } })
    try {
      expect(wrapper.find('button[aria-label="Switch agent"]').exists()).toBe(true)
      await wrapper.setProps({ locked: true })
      expect(wrapper.find('button[aria-label="Switch agent"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Claude Code')
      await wrapper.setProps({ config: undefined, loading: true })
      expect(wrapper.text()).toContain('Loading models…')
    }
    finally { wrapper.unmount() }
  })
})
