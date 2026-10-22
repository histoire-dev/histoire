import type { UiAiThread } from '@histoire/shared'
import type { AiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AgentPrompt from '../../../histoire-app/src/app/components/comments/prompt/AgentPrompt.vue'
import AiThreadView from '../../../histoire-app/src/app/components/panes/ai/AiThreadView.vue'
import { commentAttachment, commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'
import { pasteEvent, pngFile, readyAgents } from './utils/comment-prompt.js'

/** Mount a thread view with a model double recording replies. */
function mountView(thread: UiAiThread) {
  const reply = vi.fn(() => true)
  const model = { streaming: ref({}), available: ref(true), reply, back: vi.fn(), archive: vi.fn(), remove: vi.fn() } as unknown as AiThreads
  const wrapper = mount(AiThreadView, { props: { thread, model, agents: readyAgents }, global: { stubs: { BuiltinIcon: true, ThreadMessage: true, AiCreatedStories: true } } })
  return { wrapper, reply }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aI thread reply', () => {
  it('drops an upload that finishes after another thread opened', async () => {
    let finish!: () => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => finish = () => resolve({ ok: true, json: async () => commentAttachment() }))))
    const { wrapper, reply } = mountView(commentFixture({ status: 'replied', agentId: 'claude' }))
    try {
      wrapper.get('textarea').element.dispatchEvent(pasteEvent([pngFile()]))
      await flushPromises()
      const second = commentFixture({ status: 'replied', agentId: 'claude' })
      await wrapper.setProps({ thread: second })
      finish()
      await flushPromises()
      await wrapper.get('textarea').setValue('Next')
      await wrapper.get('form').trigger('submit')
      expect(reply).toHaveBeenCalledWith(second.id, 'Next', {})
    }
    finally { wrapper.unmount() }
  })

  it('drops session options when the destination agent changes', async () => {
    const { wrapper, reply } = mountView(commentFixture({ status: 'draft' }))
    try {
      const prompt = wrapper.findComponent(AgentPrompt)
      prompt.vm.$emit('update:options', { model: 'codex-large' })
      prompt.vm.$emit('choose', 'claude')
      await wrapper.get('textarea').setValue('Go')
      await wrapper.get('form').trigger('submit')
      expect(reply).toHaveBeenCalledWith(expect.any(String), 'Go', { agentId: 'claude' })
    }
    finally { wrapper.unmount() }
  })
})
