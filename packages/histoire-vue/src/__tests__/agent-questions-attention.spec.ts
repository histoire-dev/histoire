import type { UiAgentElicitation, UiAgentPermission } from '@histoire/shared'
import type { Component } from 'vue'
import type { AgentsTransport } from '../../../histoire-app/src/app/stores/agents.js'
import type { AiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import PermissionPrompt from '../../../histoire-app/src/app/components/agents/PermissionPrompt.vue'
import AgentLiveTail from '../../../histoire-app/src/app/components/comments/thread/AgentLiveTail.vue'
import AgentPendingInput from '../../../histoire-app/src/app/components/comments/thread/questions/AgentPendingInput.vue'
import { createAgentsStore, provideAgentsStore } from '../../../histoire-app/src/app/stores/agents.js'
import { provideAiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'

/** Agents store over a scripted transport, plus its captured callbacks. */
function agentsStore() {
  const callbacks: Record<string, (value: any) => void> = {}
  const subscribe = (key: string) => (callback: (value: any) => void) => {
    callbacks[key] = callback
    return () => {}
  }
  const transport: AgentsTransport = { send: vi.fn(() => true), environment: async () => {}, snapshot: subscribe('snapshot'), permission: subscribe('permission'), resolved: subscribe('resolved'), elicitation: subscribe('elicitation'), elicitationResolved: subscribe('elicitationResolved'), disconnect: subscribe('disconnect') }
  return { store: createAgentsStore(transport), callbacks }
}

/**
 * Mounts a component beneath provided agents and AI threads stores, attached to the document for focus.
 * @param component Component under test.
 * @param props Its props.
 * @param stores Provided stores.
 * @param stores.agents Agents store.
 * @param stores.threads Partial AI threads store.
 */
function mountWith(component: Component, props: Record<string, unknown>, stores: { agents: ReturnType<typeof createAgentsStore>, threads?: Partial<AiThreads> }) {
  const Host = defineComponent({
    setup() {
      provideAgentsStore(stores.agents)
      if (stores.threads) provideAiThreads(stores.threads as AiThreads)
      return () => h('div', [h('textarea'), h(component, props)])
    },
  })
  return mount(Host, { attachTo: document.body, global: { stubs: { BuiltinIcon: true } } })
}

const plan: UiAgentPermission = { requestId: 'plan', agentId: 'claude', kind: 'plan', detail: 'Ready to code?', threadId: 'one', plan: 'Add a prop', choices: [{ id: 'reject', label: 'Keep planning', intent: 'reject' }, { id: 'approve', label: 'Approve', intent: 'approve' }] }
const link: UiAgentElicitation = { requestId: 'link', agentId: 'claude', threadId: 'two', message: 'Sign in', expiresAt: '2026-10-22T12:00:00.000Z', mode: 'url', url: 'https://auth.example.com/x', host: 'auth.example.com' }
const scroll = vi.fn()

beforeEach(() => {
  Element.prototype.scrollIntoView = scroll
})
afterEach(() => {
  scroll.mockReset()
  document.body.innerHTML = ''
})

describe('agent questions needing attention', () => {
  it('lists threads waiting for an answer, ignoring tool permissions', () => {
    const { store, callbacks } = agentsStore()
    callbacks.permission(plan)
    callbacks.permission({ requestId: 'tool', agentId: 'claude', kind: 'file-edit', detail: 'Edit file', threadId: 'three' })
    callbacks.elicitation(link)
    callbacks.elicitation({ ...link, requestId: 'again' })
    expect(store.needsInput.value).toEqual(['one', 'two'])
  })

  it('opens the thread of the floating question where it lives', async () => {
    const { store, callbacks } = agentsStore()
    const reveal = vi.fn()
    callbacks.elicitation(link)
    const wrapper = mountWith(PermissionPrompt, {}, { agents: store, threads: { reveal } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Open thread')!.trigger('click')
    expect(reveal).toHaveBeenCalledWith('two')
    wrapper.unmount()
  })

  it('reveals a new in-thread question and focuses its primary action', async () => {
    const { store, callbacks } = agentsStore()
    const wrapper = mountWith(AgentPendingInput, { threadId: 'one' }, { agents: store })
    await flushPromises()
    expect(scroll).not.toHaveBeenCalled()
    callbacks.permission(plan)
    await flushPromises()
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
    expect(document.activeElement?.textContent?.trim()).toBe('Approve')
    wrapper.unmount()
  })

  it('does not steal focus from a text field when a question appears', async () => {
    const { store, callbacks } = agentsStore()
    const wrapper = mountWith(AgentPendingInput, { threadId: 'one' }, { agents: store })
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    textarea.focus()
    callbacks.permission(plan)
    await flushPromises()
    expect(scroll).toHaveBeenCalled()
    expect(document.activeElement).toBe(textarea)
    wrapper.unmount()
  })

  it('names the running plan entry while the agent works between tools', async () => {
    const { store } = agentsStore()
    const streaming = ref({ one: { agentId: 'claude', text: '', steps: [], startedAt: 0, plan: [
      { content: 'Read the story', status: 'completed' },
      { content: 'Add the size prop', status: 'in_progress' },
    ] } })
    const wrapper = mountWith(AgentLiveTail, { threadId: 'one', steps: [], text: '' }, { agents: store, threads: { streaming } as unknown as Partial<AiThreads> })
    expect(wrapper.get('[role="status"]').text()).toContain('Add the size prop')
    wrapper.unmount()
  })
})
