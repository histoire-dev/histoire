import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CommentThread from '../../../histoire-app/src/app/components/comments/CommentThread.vue'
import AgentPrompt from '../../../histoire-app/src/app/components/comments/prompt/AgentPrompt.vue'
import { commentAttachment, commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'
import { readyAgents as agents, pasteEvent } from './utils/comment-prompt.js'

describe('comment thread drafts', () => {
  it('scopes unsent replies to their thread while retaining a same-thread draft through updates', async () => {
    const first = commentFixture({ agentId: 'first-agent' })
    const second = commentFixture({ agentId: 'second-agent' })
    const wrapper = mount(CommentThread, { props: { thread: first, title: 'First', agents: [] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      await wrapper.get('textarea').setValue('Instruction for first comment')
      await wrapper.setProps({ thread: second, title: 'Second' })
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
      await wrapper.get('textarea').setValue('Instruction for second comment')
      await wrapper.setProps({ thread: { ...second, updatedAt: '2026-10-04T12:00:00.000Z' } })
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Instruction for second comment')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[second.id, 'Instruction for second comment', {}]])
    }
    finally { wrapper.unmount() }
  })

  it('renders persisted agent steps as collapsed phases and sanitized markdown', async () => {
    const comment = commentFixture({ status: 'replied', agentId: 'agent', thread: [{ author: 'agent', agentId: 'agent', at: '2026-10-03T10:01:00.000Z', body: 'Added **cat** <img src=x onerror=alert(1)>\n\n- one', steps: [
      { id: 'a', kind: 'read', title: 'Read Meow.story.vue', status: 'completed', target: 'src/Meow.story.vue' },
      { id: 'b', kind: 'edit', title: 'Edit Meow.story.vue', status: 'completed', target: 'src/Meow.story.vue', added: 1, removed: 0 },
    ] }] })
    const wrapper = mount(CommentThread, { props: { thread: comment, title: 'Meow', agents: [{ id: 'agent', name: 'Claude Code', state: 'idle' }] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      await flushPromises()
      await expect.poll(() => wrapper.find('.agent-markdown strong').exists()).toBe(true)
      const markdown = wrapper.get('.agent-markdown')
      expect(markdown.find('img').exists()).toBe(false)
      expect(markdown.find('li').text()).toBe('one')
      const rows = wrapper.findAll('.phase-row')
      expect(rows.map(row => row.text())).toEqual(['Exploredread 1 file', 'EditedMeow.story.vue+1 -0'])
      expect(wrapper.find('.phase-steps').exists()).toBe(false)
      await rows[1].trigger('click')
      expect(wrapper.get('.phase-steps').text()).toContain('Edit Meow.story.vue')
    }
    finally { wrapper.unmount() }
  })

  it('renders plan decisions collapsed with their outcome', async () => {
    const comment = commentFixture({ status: 'replied', agentId: 'agent', thread: [{ author: 'agent', agentId: 'agent', at: '2026-10-03T10:01:00.000Z', body: 'Kept planning.', decisions: [{ plan: '# Plan\n\n- Add **prop**', outcome: 'kept-planning' }] }] })
    const wrapper = mount(CommentThread, { props: { thread: comment, title: 'Meow', agents: [{ id: 'agent', name: 'Claude Code', state: 'idle' }] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      const decision = wrapper.get('[aria-label="Plan decision"]')
      expect(decision.text()).toContain('Kept planning')
      expect(decision.find('.agent-markdown').exists()).toBe(false)
      await decision.get('button').trigger('click')
      await expect.poll(() => decision.find('.agent-markdown strong').exists()).toBe(true)
      expect(decision.get('.agent-markdown li').text()).toBe('Add prop')
    }
    finally { wrapper.unmount() }
  })
})

/** Mount thread with icon stubs; message rendering is irrelevant for reply behavior. */
function mountThread(overrides: Parameters<typeof commentFixture>[0]) {
  return mount(CommentThread, { props: { thread: commentFixture(overrides), title: 'Button', agents }, global: { stubs: { BuiltinIcon: true, ThreadMessage: true } } })
}

describe('comment thread reply', () => {
  it('continues bound agent conversation without choosing another agent', async () => {
    const wrapper = mountThread({ status: 'replied', agentId: 'claude' })
    try {
      await wrapper.get('textarea').setValue('Also blue')
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
      expect(wrapper.emitted('reply')).toEqual([[expect.any(String), 'Also blue', {}]])
    }
    finally { wrapper.unmount() }
  })

  it('sends never-sent comment to default agent', async () => {
    const wrapper = mountThread({ status: 'draft' })
    try {
      await wrapper.get('textarea').setValue('Go')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[expect.any(String), 'Go', { agentId: 'codex' }]])
    }
    finally { wrapper.unmount() }
  })

  it('sends uploaded attachments with the reply and clears them', async () => {
    const attachment = commentAttachment({ path: '.histoire/attachments/00000000-0000-0000-0000-000000000000-a.txt', name: 'a.txt', mimeType: 'text/plain', size: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => attachment })))
    const wrapper = mountThread({ status: 'replied', agentId: 'claude' })
    try {
      wrapper.get('textarea').element.dispatchEvent(pasteEvent([new File(['a'], 'a.txt', { type: 'text/plain' })]))
      await flushPromises()
      await wrapper.get('textarea').setValue('See file')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[expect.any(String), 'See file', { attachments: [attachment] }]])
      expect(wrapper.find('button[aria-label="Remove a.txt"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('blocks replies while agent works', async () => {
    const wrapper = mountThread({ status: 'working', agentId: 'claude' })
    try {
      expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toBeUndefined()
    }
    finally { wrapper.unmount() }
  })

  it('drops an upload that finishes after another thread opened', async () => {
    let finish!: () => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => finish = () => resolve({ ok: true, json: async () => commentAttachment() }))))
    const wrapper = mountThread({ status: 'replied', agentId: 'claude' })
    try {
      wrapper.get('textarea').element.dispatchEvent(pasteEvent([new File(['png'], 'a.png', { type: 'image/png' })]))
      await flushPromises()
      const second = commentFixture({ status: 'replied', agentId: 'claude' })
      await wrapper.setProps({ thread: second })
      finish()
      await flushPromises()
      await wrapper.get('textarea').setValue('Next')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[second.id, 'Next', {}]])
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('asks for plan changes and focuses the composer when the agent kept planning', async () => {
    const working = commentFixture({ status: 'working', agentId: 'claude' })
    const wrapper = mount(CommentThread, { attachTo: document.body, props: { thread: working, title: 'Button', agents }, global: { stubs: { BuiltinIcon: true, ThreadMessage: true } } })
    try {
      await wrapper.setProps({ thread: { ...working, status: 'replied', thread: [{ author: 'agent', agentId: 'claude', at: '2026-10-03T10:01:00.000Z', body: 'Kept planning.', decisions: [{ plan: '# Plan', outcome: 'kept-planning' }] }] } })
      await flushPromises()
      expect(wrapper.get('textarea').attributes('placeholder')).toBe('What should change in the plan?')
      expect(document.activeElement).toBe(wrapper.get('textarea').element)
    }
    finally { wrapper.unmount() }
  })

  it('drops session options when the destination agent changes', async () => {
    const wrapper = mountThread({ status: 'draft' })
    try {
      const prompt = wrapper.findComponent(AgentPrompt)
      prompt.vm.$emit('update:options', { model: 'codex-large' })
      prompt.vm.$emit('choose', 'claude')
      await wrapper.get('textarea').setValue('Go')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[expect.any(String), 'Go', { agentId: 'claude' }]])
    }
    finally { wrapper.unmount() }
  })
})
