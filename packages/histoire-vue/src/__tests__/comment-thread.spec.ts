import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CommentThread from '../../../histoire-app/src/app/components/comments/CommentThread.vue'
import { commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'

describe('comment thread drafts', () => {
  it('scopes unsent replies to their thread while retaining a same-thread draft through updates', async () => {
    const first = commentFixture({ agentId: 'first-agent' })
    const second = commentFixture({ agentId: 'second-agent' })
    const wrapper = mount(CommentThread, { props: { comment: first, title: 'First', agents: [] }, global: { stubs: { CommentContext: true, WorkbenchIcon: true } } })
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
})
