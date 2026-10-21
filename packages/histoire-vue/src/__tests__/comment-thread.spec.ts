import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CommentThread from '../../../histoire-app/src/app/components/comments/CommentThread.vue'
import { commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'

describe('comment thread drafts', () => {
  it('scopes unsent replies to their thread while retaining a same-thread draft through updates', async () => {
    const first = commentFixture({ agentId: 'first-agent' })
    const second = commentFixture({ agentId: 'second-agent' })
    const wrapper = mount(CommentThread, { props: { comment: first, title: 'First', agents: [] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      await wrapper.get('input').setValue('Instruction for first comment')
      await wrapper.setProps({ comment: second, title: 'Second' })
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
      await wrapper.get('input').setValue('Instruction for second comment')
      await wrapper.setProps({ comment: { ...second, updatedAt: '2026-10-04T12:00:00.000Z' } })
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Instruction for second comment')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('reply')).toEqual([[second.id, 'Instruction for second comment']])
    }
    finally { wrapper.unmount() }
  })

  it('renders persisted agent steps as collapsed phases and sanitized markdown', async () => {
    const comment = commentFixture({ status: 'replied', agentId: 'agent', thread: [{ author: 'agent', agentId: 'agent', at: '2026-10-03T10:01:00.000Z', body: 'Added **cat** <img src=x onerror=alert(1)>\n\n- one', steps: [
      { id: 'a', kind: 'read', title: 'Read Meow.story.vue', status: 'completed', target: 'src/Meow.story.vue' },
      { id: 'b', kind: 'edit', title: 'Edit Meow.story.vue', status: 'completed', target: 'src/Meow.story.vue', added: 1, removed: 0 },
    ] }] })
    const wrapper = mount(CommentThread, { props: { comment, title: 'Meow', agents: [{ id: 'agent', name: 'Claude Code', state: 'idle' }] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
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
})
