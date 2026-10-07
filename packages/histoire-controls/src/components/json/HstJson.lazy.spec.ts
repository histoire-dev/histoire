import type { Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onMounted } from 'vue'

/** Hold editor module evaluation so wrapper behavior can be checked before resolve. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return {
    /** Delayed editor module consumed by the public control wrapper. */
    promise,
    /** Resolves the delayed editor module. */
    resolve,
    /** Rejects the delayed module request. */
    reject,
  }
}

describe('json lazy editor boundary', () => {
  it('keeps package imports light, forwards latest props and focus, and retires pending mounts', async () => {
    vi.resetModules()
    const editorModule = createDeferred<{ default: Component }>()
    const editorRequested = vi.fn()
    const editorMounted = vi.fn()
    const editorFocus = vi.fn()
    vi.doMock('./HstJsonEditor.vue', () => {
      editorRequested()
      return editorModule.promise.then(module => ({
        __esModule: true,
        __isTeleport: false,
        default: module.default,
      }))
    })
    vi.doMock('@codemirror/state', () => {
      throw new Error('CodeMirror state loaded before HstJson editor was rendered')
    })

    const mounted: Array<{ unmount: () => void }> = []
    try {
      const { HstJson } = await import('../../index.ts')
      expect(editorRequested).not.toHaveBeenCalled()

      const first = mount(HstJson, {
        props: { modelValue: { count: 1 }, title: 'Initial' },
        attrs: { 'data-forwarded': 'yes' },
        slots: { actions: () => h('span', { 'data-forwarded-slot': '' }, 'Action') },
      })
      mounted.push(first)
      const disabled = mount(HstJson, { props: { modelValue: { count: 5 }, disabled: true } })
      mounted.push(disabled)
      const retired = mount(HstJson, { props: { modelValue: { count: 7 }, title: 'Retired' } })
      mounted.push(retired)
      await vi.waitFor(() => expect(editorRequested).toHaveBeenCalledOnce())
      expect(editorMounted).not.toHaveBeenCalled()
      expect(first.get('.histoire-control-label').text()).toContain('Initial')
      expect(first.get('[role="status"]').attributes('aria-busy')).toBe('true')
      expect(first.get('[role="status"]').text()).toContain('Loading JSON editor')

      expect(() => (first.vm as unknown as { focus: () => void }).focus()).not.toThrow()
      expect(() => (disabled.vm as unknown as { focus: () => void }).focus()).not.toThrow()
      expect(() => (retired.vm as unknown as { focus: () => void }).focus()).not.toThrow()
      await first.setProps({ modelValue: { count: 2 }, title: 'Latest' })
      retired.unmount()
      mounted.splice(mounted.indexOf(retired), 1)

      editorModule.resolve({
        default: defineComponent({
          name: 'DeferredHstJsonEditor',
          props: ['modelValue', 'title', 'disabled', 'readonly', 'layout'],
          emits: ['update:modelValue'],
          /** Records the props and focus handle forwarded by the wrapper. */
          setup(props, { attrs, emit, expose, slots }) {
            let mounted = false
            onMounted(() => {
              mounted = true
              editorMounted()
            })
            expose({ focus: () => {
              if (mounted) editorFocus()
            } })
            return () => h('output', {
              ...attrs,
              'data-json-editor': '',
              'data-title': props.title,
              'data-value': JSON.stringify(props.modelValue),
              'data-disabled': String(!!props.disabled),
            }, [
              h('button', { 'data-update': '', 'onClick': () => emit('update:modelValue', { count: 3 }) }),
              slots.actions?.(),
            ])
          },
        }),
      })
      await flushPromises()

      expect(editorMounted).toHaveBeenCalledTimes(2)
      expect(first.get('[data-json-editor]').attributes()).toMatchObject({
        'data-title': 'Latest',
        'data-value': '{"count":2}',
        'data-disabled': 'false',
        'data-forwarded': 'yes',
      })
      expect(first.find('[data-forwarded-slot]').text()).toBe('Action')
      await first.get('[data-update]').trigger('click')
      expect(first.emitted('update:modelValue')).toEqual([[{ count: 3 }]])
      expect(disabled.get('[data-json-editor]').attributes('data-disabled')).toBe('true')
      expect(editorFocus).toHaveBeenCalledOnce()
      ;(first.vm as unknown as { focus: () => void }).focus()
      expect(editorFocus).toHaveBeenCalledTimes(2)
    }
    finally {
      for (const wrapper of mounted) wrapper.unmount()
      vi.doUnmock('./HstJsonEditor.vue')
      vi.doUnmock('./HstJsonEditorAsync')
      vi.doUnmock('@codemirror/state')
      vi.resetModules()
    }
  })

  it('keeps control label visible after import failure and retries when requested', async () => {
    vi.resetModules()
    const failedImport = createDeferred<{ default: Component }>()
    const retryImport = createDeferred<{ default: Component }>()
    let importAttempts = 0
    vi.doMock('./HstJsonEditorAsync', () => ({
      loadHstJsonEditor: () => {
        importAttempts++
        return importAttempts === 1 ? failedImport.promise : retryImport.promise
      },
    }))

    let wrapper: ReturnType<typeof mount> | undefined
    try {
      const { HstJson } = await import('../../index.ts')
      wrapper = mount(HstJson, { props: { modelValue: { count: 1 }, title: 'Data' } })
      await vi.waitFor(() => expect(importAttempts).toBe(1))
      expect(wrapper.get('.histoire-control-label').text()).toContain('Data')
      expect(wrapper.get('[role="status"]').text()).toContain('Loading JSON editor')

      failedImport.reject(new Error('transient editor chunk failure'))
      await vi.waitFor(() => expect(wrapper?.find('[role="alert"]').exists()).toBe(true))
      expect(wrapper.get('.histoire-control-label').text()).toContain('Data')
      expect(wrapper.get('[role="alert"]').text()).toContain('JSON editor failed to load')

      await wrapper.get('button[aria-label="Retry"]').trigger('click')
      await vi.waitFor(() => expect(importAttempts).toBe(2))
      expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
      retryImport.resolve({
        default: defineComponent({
          props: ['modelValue', 'title'],
          setup(props) {
            return () => h('output', { 'data-editor-loaded': '', 'data-title': props.title })
          },
        }),
      })
      await flushPromises()

      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.get('[data-editor-loaded]').attributes('data-title')).toBe('Data')
    }
    finally {
      wrapper?.unmount()
      vi.doUnmock('./HstJsonEditor.vue')
      vi.doUnmock('./HstJsonEditorAsync')
      vi.resetModules()
    }
  })
})
