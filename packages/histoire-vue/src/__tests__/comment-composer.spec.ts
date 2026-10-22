import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CommentComposer from '../../../histoire-app/src/app/components/comments/CommentComposer.vue'
import AgentPrompt from '../../../histoire-app/src/app/components/comments/prompt/AgentPrompt.vue'
import { commentAttachment, commentDraft } from '../../../histoire/src/node/__tests__/utils/comments.js'
import { readyAgents as agents, pasteEvent, pngFile } from './utils/comment-prompt.js'

describe('comment composer dismissal', () => {
  it.each([false, true])('closes without sending while capturing is %s', async (capturing) => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents: [], capturing }, global: { stubs: { BuiltinIcon: true } } })
    try {
      await wrapper.get('textarea').setValue('Unsent instruction')
      const close = wrapper.get('button[aria-label="Close comment"]')
      expect(close.attributes('type')).toBe('button')
      await close.trigger('click')
      expect(wrapper.emitted('close')).toEqual([[]])
      expect(wrapper.emitted('send')).toBeUndefined()
    }
    finally { wrapper.unmount() }
  })
})

describe('comment screenshot shortcut', () => {
  it.each(['ctrlKey', 'metaKey'])('captures from the message field with %s and suppresses repeats and concurrent captures', async (modifier) => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents: [] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      const input = wrapper.get('textarea')
      const shortcut = { key: 'S', shiftKey: true, [modifier]: true }
      const event = new KeyboardEvent('keydown', { ...shortcut, bubbles: true, cancelable: true })
      input.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(wrapper.emitted('attach')).toEqual([[]])
      await input.trigger('keydown', { key: 'S', shiftKey: true })
      await input.trigger('keydown', { ...shortcut, repeat: true })
      await wrapper.setProps({ capturing: true })
      await input.trigger('keydown', shortcut)
      expect(wrapper.emitted('attach')).toHaveLength(1)
    }
    finally { wrapper.unmount() }
  })
})

describe('comment composer prompt', () => {
  it('sends with default agent on Ctrl+Enter', async () => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      const input = wrapper.get('textarea')
      await input.setValue('Make it red')
      await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
      expect(wrapper.emitted('send')?.[0]).toEqual([expect.objectContaining({ body: 'Make it red' }), 'codex', {}])
    }
    finally { wrapper.unmount() }
  })

  it('removes attached screenshot', async () => {
    const wrapper = mount(CommentComposer, { props: { draft: { ...commentDraft(), screenshot: '.histoire/screenshots/a.png' }, title: 'Button', agents }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      await wrapper.get('button[aria-label="Remove Screenshot"]').trigger('click')
      expect(wrapper.emitted('removeScreenshot')).toEqual([[]])
    }
    finally { wrapper.unmount() }
  })

  it('drops session options chosen for another agent', async () => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      const prompt = wrapper.findComponent(AgentPrompt)
      prompt.vm.$emit('update:options', { model: 'codex-large' })
      prompt.vm.$emit('choose', 'claude')
      await wrapper.get('textarea').setValue('Go')
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
      expect(wrapper.emitted('send')?.[0]).toEqual([expect.anything(), 'claude', {}])
    }
    finally { wrapper.unmount() }
  })

  it('drops an upload that finishes after the draft changed', async () => {
    let finish!: () => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => finish = () => resolve({ ok: true, json: async () => commentAttachment() }))))
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents }, global: { stubs: { CommentContext: true, BuiltinIcon: true } }, attachTo: document.body })
    try {
      wrapper.get('textarea').element.dispatchEvent(pasteEvent([pngFile()]))
      await flushPromises()
      await wrapper.setProps({ draft: commentDraft('Other') })
      finish()
      await flushPromises()
      expect(wrapper.find('button[aria-label="Remove a.png"]').exists()).toBe(false)
      expect(document.activeElement).toBe(wrapper.get('textarea').element)
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
})
