import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import HstJson from './HstJson.vue'

describe('json edit ownership', () => {
  it('keeps disabled and readonly editors locked while preserving focus rules', async () => {
    const wrapper = mount(HstJson, { attachTo: document.body, props: { modelValue: {}, disabled: true } })
    try {
      const editor = EditorView.findFromDOM(wrapper.get('.cm-editor').element as HTMLElement)!
      expect(editor.state.facet(EditorState.readOnly)).toBe(true)
      expect(wrapper.get('.cm-content').attributes('aria-disabled')).toBe('true')
      wrapper.vm.focus()
      expect(document.activeElement).not.toBe(editor.contentDOM)
      await wrapper.setProps({ disabled: false, readonly: true })
      expect(editor.state.facet(EditorState.readOnly)).toBe(true)
      wrapper.vm.focus()
      expect(document.activeElement).toBe(editor.contentDOM)
      await wrapper.setProps({ readonly: false })
      expect(editor.state.facet(EditorState.readOnly)).toBe(false)
    }
    finally { wrapper.unmount() }
  })

  it('retains invalid drafts without publishing and accepts subsequent valid JSON', async () => {
    const wrapper = mount(HstJson, { props: { title: 'Data', modelValue: { count: 1 } } })
    try {
      const editor = EditorView.findFromDOM(wrapper.get('.cm-editor').element as HTMLElement)!
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '{' } })
      await nextTick()
      expect(editor.state.doc.toString()).toBe('{')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '{"count":2}' } })
      await nextTick()
      expect(wrapper.emitted('update:modelValue')).toEqual([[{ count: 2 }]])
      await wrapper.setProps({ modelValue: { count: 3 } })
      expect(editor.state.doc.toString()).toContain('3')
    }
    finally { wrapper.unmount() }
  })
})
