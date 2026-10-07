import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CommentComposer from '../../../histoire-app/src/app/components/comments/CommentComposer.vue'
import { commentDraft } from '../../../histoire/src/node/__tests__/utils/comments.js'

describe('comment composer dismissal', () => {
  it.each([false, true])('closes without saving or sending while capturing is %s', async (capturing) => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents: [], capturing }, global: { stubs: { BuiltinIcon: true } } })
    try {
      await wrapper.get('textarea').setValue('Unsent instruction')
      const close = wrapper.get('button[aria-label="Close comment"]')
      expect(close.attributes('type')).toBe('button')
      await close.trigger('click')
      expect(wrapper.emitted('close')).toEqual([[]])
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(wrapper.emitted('send')).toBeUndefined()
    }
    finally { wrapper.unmount() }
  })
})

describe('comment screenshot shortcut', () => {
  it.each(['ctrlKey', 'metaKey'])('attaches from message field with %s and suppresses repeats and concurrent captures', async (modifier) => {
    const wrapper = mount(CommentComposer, { props: { draft: commentDraft(), title: 'Button', agents: [] }, global: { stubs: { CommentContext: true, BuiltinIcon: true } } })
    try {
      const input = wrapper.get('textarea')
      const button = wrapper.get('button[aria-label="Attach screenshot"]')
      expect(button.attributes('title')).toMatch(/^Attach screenshot \((Ctrl|⌘) ⇧ S\)$/)
      const shortcut = { key: 'S', shiftKey: true, [modifier]: true }
      const event = new KeyboardEvent('keydown', { ...shortcut, bubbles: true, cancelable: true })
      input.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(wrapper.emitted('attach')).toEqual([[]])
      await input.trigger('keydown', { key: 'S', shiftKey: true })
      await input.trigger('keydown', { ...shortcut, repeat: true })
      await wrapper.setProps({ capturing: true })
      expect(button.attributes('title')).toBe('Capturing screenshot')
      await input.trigger('keydown', shortcut)
      expect(wrapper.emitted('attach')).toHaveLength(1)
      await wrapper.setProps({ capturing: false })
      await wrapper.get('button[aria-label="Attach screenshot"]').trigger('click')
      expect(wrapper.emitted('attach')).toHaveLength(2)
    }
    finally { wrapper.unmount() }
  })
})
