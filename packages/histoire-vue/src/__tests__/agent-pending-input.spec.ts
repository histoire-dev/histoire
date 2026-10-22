import type { UiAgentElicitation, UiAgentPermission } from '@histoire/shared'
import type { AgentsTransport } from '../../../histoire-app/src/app/stores/agents.js'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import AgentPendingInput from '../../../histoire-app/src/app/components/comments/thread/questions/AgentPendingInput.vue'
import { createAgentsStore, provideAgentsStore } from '../../../histoire-app/src/app/stores/agents.js'

/** Agents store over a scripted transport, plus its captured callbacks. */
function agentsStore() {
  const callbacks: Record<string, (value: any) => void> = {}
  const subscribe = (key: string) => (callback: (value: any) => void) => {
    callbacks[key] = callback
    return () => {}
  }
  const send = vi.fn(() => true)
  const transport: AgentsTransport = { send, environment: async () => {}, snapshot: subscribe('snapshot'), permission: subscribe('permission'), resolved: subscribe('resolved'), elicitation: subscribe('elicitation'), elicitationResolved: subscribe('elicitationResolved'), disconnect: subscribe('disconnect') }
  return { store: createAgentsStore(transport), callbacks, send }
}

/** Mounts the thread's question area beneath a provided agents store. */
function mountPending(store: ReturnType<typeof createAgentsStore>) {
  const Host = defineComponent({
    setup() {
      provideAgentsStore(store)
      return () => h(AgentPendingInput, { threadId: 'one' })
    },
  })
  return mount(Host, { global: { stubs: { BuiltinIcon: true } } })
}

const plan: UiAgentPermission = { requestId: 'plan', agentId: 'claude', kind: 'plan', detail: 'Ready to code?', threadId: 'one', plan: 'Add a **size** prop', choices: [{ id: 'reject', label: 'Keep planning', intent: 'reject' }, { id: 'approve', label: 'Approve', intent: 'approve' }] }
const form: UiAgentElicitation = { requestId: 'form', agentId: 'claude', threadId: 'one', message: 'Which color?', expiresAt: '2026-10-22T12:00:00.000Z', mode: 'form', fields: [
  { key: 'question_0', type: 'choice', required: true, title: 'Color', options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] },
  { key: 'question_0_custom', type: 'text', required: false, title: 'Other' },
] }

/** AskUserQuestion-shaped form: one optional question with a folded free-text answer. */
const ask: UiAgentElicitation = { ...form, requestId: 'ask', fields: [
  { key: 'question_0', type: 'choice', required: false, title: 'Color', options: [{ value: 'red', label: 'Red', description: 'Warm' }, { value: 'blue', label: 'Blue (Recommended)' }] },
  { key: 'question_0_custom', type: 'text', required: false, title: 'Other', description: 'Type your own answer, or add a note to the option you chose above (optional).' },
] }

/** Finds a button by its visible text or accessible name. */
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(item => item.text() === text || item.attributes('aria-label') === text)!
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('in-thread agent questions', () => {
  it('answers a plan approval with the chosen option and owns it while mounted', async () => {
    const { store, callbacks, send } = agentsStore()
    callbacks.permission(plan)
    const wrapper = mountPending(store)
    await flushPromises()
    expect(store.offscreen.value.plans).toEqual([])
    expect(wrapper.text()).toContain('Ready to code?')
    await wrapper.findAll('button').find(button => button.text() === 'Approve')!.trigger('click')
    expect(send).toHaveBeenCalledWith('histoire:ui:agent-permission-reply', { requestId: 'plan', allow: true, remember: false, choice: 'approve' })
    callbacks.permission({ ...plan, requestId: 'next' })
    wrapper.unmount()
    expect(store.offscreen.value.plans.map(item => item.requestId)).toEqual(['next'])
  })

  it('blocks invalid forms and sends validated answers or a skip', async () => {
    const { store, callbacks, send } = agentsStore()
    callbacks.elicitation(form)
    const wrapper = mountPending(store)
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('Required')
    expect(send).not.toHaveBeenCalled()
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(send).toHaveBeenLastCalledWith('histoire:ui:agent-elicitation-reply', { requestId: 'form', action: 'accept', content: { question_0: 'blue' } })
    await wrapper.findAll('button').find(button => button.text() === 'Skip')!.trigger('click')
    expect(send).toHaveBeenLastCalledWith('histoire:ui:agent-elicitation-reply', { requestId: 'form', action: 'decline' })
    wrapper.unmount()
  })

  it('folds the free-text answer into the option list and sends it under its own key', async () => {
    const { store, callbacks, send } = agentsStore()
    callbacks.elicitation(ask)
    const wrapper = mountPending(store)
    await flushPromises()
    expect(wrapper.text()).not.toContain('(Recommended)')
    expect(wrapper.text()).not.toContain('Type your own answer')
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(3)
    await radios[1].setValue(true)
    await radios[2].setValue(true)
    await wrapper.get('input[type="text"]').setValue('Green')
    await wrapper.get('form').trigger('submit')
    expect(send).toHaveBeenLastCalledWith('histoire:ui:agent-elicitation-reply', { requestId: 'ask', action: 'accept', content: { question_0_custom: 'Green' } })
    wrapper.unmount()
  })

  it('dismisses a question from the header', async () => {
    const { store, callbacks, send } = agentsStore()
    callbacks.elicitation(form)
    const wrapper = mountPending(store)
    await flushPromises()
    expect(button(wrapper, 'Cancel')).toBeUndefined()
    await wrapper.get('button[aria-label="Dismiss"]').trigger('click')
    expect(send).toHaveBeenLastCalledWith('histoire:ui:agent-elicitation-reply', { requestId: 'form', action: 'cancel' })
    wrapper.unmount()
  })

  it('counts down only during the last two minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(Date.parse(form.expiresAt) - 150_000)
    const { store, callbacks } = agentsStore()
    callbacks.elicitation(form)
    const wrapper = mountPending(store)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Expires in')
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(wrapper.text()).toContain('Expires in 1:30')
    vi.advanceTimersByTime(1_000)
    await flushPromises()
    expect(wrapper.text()).toContain('Expires in 1:29')
    wrapper.unmount()
  })

  it('opens a link only on click, then waits for the agent', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const { store, callbacks, send } = agentsStore()
    callbacks.elicitation({ requestId: 'link', agentId: 'claude', threadId: 'one', message: 'Sign in', expiresAt: '2026-10-22T12:00:00.000Z', mode: 'url', url: 'https://auth.example.com/x', host: 'auth.example.com' })
    const wrapper = mountPending(store)
    await flushPromises()
    expect(open).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('auth.example.com')
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await button(wrapper, 'Copy link').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('https://auth.example.com/x')
    expect(button(wrapper, 'Copied')).toBeDefined()
    expect(send).not.toHaveBeenCalled()
    await wrapper.findAll('button').find(button => button.text() === 'Open link')!.trigger('click')
    expect(open).toHaveBeenCalledWith('https://auth.example.com/x', '_blank', 'noopener,noreferrer')
    expect(send).toHaveBeenLastCalledWith('histoire:ui:agent-elicitation-reply', { requestId: 'link', action: 'accept' })
    expect(wrapper.get('[role="status"]').text()).toBe('Waiting for completion')
    callbacks.elicitationResolved({ requestId: 'link', reason: 'completed' })
    await flushPromises()
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })
})
