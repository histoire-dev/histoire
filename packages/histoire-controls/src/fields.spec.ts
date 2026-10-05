import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onMounted, ref } from 'vue'
import HstButton from './components/button/HstButton.vue'
import HstButtonGroup from './components/button/HstButtonGroup.vue'
import HstCheckboxList from './components/checkbox/HstCheckboxList.vue'
import HstNumber from './components/number/HstNumber.vue'
import HstRadio from './components/radio/HstRadio.vue'
import HstText from './components/text/HstText.vue'
import HstTextarea from './components/textarea/HstTextarea.vue'
import { getControlElement } from './field'

describe('shared field contracts', () => {
  it('forwards field attributes and emits one update per edit', async () => {
    const input = vi.fn()
    const wrapper = mount(HstText, { props: { title: 'Secret', type: 'password' }, attrs: { id: 'secret', name: 'secret', required: true, autocomplete: 'new-password', onInput: input } })
    try {
      const field = wrapper.get('input')
      expect(field.attributes()).toMatchObject({ id: 'secret', name: 'secret', required: '', autocomplete: 'new-password', type: 'password' })
      expect(wrapper.findAll('[id="secret"]')).toHaveLength(1)
      await field.setValue('value')
      expect(input).toHaveBeenCalledOnce()
      expect(wrapper.emitted('update:modelValue')).toEqual([['value']])
    }
    finally { wrapper.unmount() }
  })

  it('exposes textarea focus and selection without submitting surrounding forms', () => {
    const wrapper = mount(HstTextarea, { attachTo: document.body, props: { modelValue: 'Draft' }, attrs: { 'aria-label': 'Draft' } })
    try {
      wrapper.vm.focus()
      expect(document.activeElement).toBe(wrapper.get('textarea').element)
      wrapper.vm.select()
      expect((document.activeElement as HTMLTextAreaElement).selectionEnd).toBe(5)
    }
    finally { wrapper.unmount() }
  })

  it('resolves native field during parent mount before exposed child refs settle', () => {
    let element: HTMLElement | undefined
    const wrapper = mount(defineComponent({ setup() {
      onMounted(() => element?.focus())
      return () => h(HstTextarea, { ref: value => element = getControlElement(value), modelValue: 'Draft' })
    } }), { attachTo: document.body })
    try {
      expect(document.activeElement).toBe(wrapper.get('textarea').element)
    }
    finally { wrapper.unmount() }
  })

  it('keeps search fields in native forms and reflects changing native attrs', async () => {
    const disabled = ref(false)
    const search = ref('query')
    const submit = vi.fn((event: Event) => event.preventDefault())
    const wrapper = mount(defineComponent({ setup: () => () => h('form', { onSubmit: submit }, [
      h(HstText, { 'title': 'Find', 'type': 'search', 'name': 'query', 'modelValue': search.value, 'disabled': disabled.value, 'required': true, 'onUpdate:modelValue': value => search.value = value }),
      h(HstButton, { type: 'submit' }, { default: () => 'Go' }),
    ]) }), { attachTo: document.body })
    try {
      expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('input').attributes('id'))
      expect(new FormData(wrapper.get('form').element as HTMLFormElement).get('query')).toBe('query')
      await wrapper.get('button').trigger('click')
      expect(submit).toHaveBeenCalledOnce()
      disabled.value = true
      await wrapper.vm.$nextTick()
      expect(wrapper.get('input').attributes('disabled')).toBe('')
    }
    finally { wrapper.unmount() }
  })

  it('blocks disabled numeric dragging and focus without losing numeric edits', async () => {
    const wrapper = mount(HstNumber, { attachTo: document.body, props: { title: 'Count', modelValue: 2 }, attrs: { disabled: true, step: 0.5 } })
    try {
      await wrapper.get('label').trigger('mousedown', { clientX: 10 })
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }))
      wrapper.vm.focus()
      expect(document.activeElement).not.toBe(wrapper.get('input').element)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      await wrapper.setProps({ disabled: false })
      await wrapper.get('input').setValue('3.5')
      expect(wrapper.emitted('update:modelValue')).toEqual([[3.5]])
    }
    finally { wrapper.unmount() }
  })

  it('preserves native numeric caret clicks while label clicks select the value', async () => {
    const wrapper = mount(HstNumber, { props: { title: 'Count', modelValue: 12 } })
    try {
      const select = vi.spyOn(wrapper.get('input').element as HTMLInputElement, 'select')
      await wrapper.get('input').trigger('click')
      expect(select).not.toHaveBeenCalled()
      await wrapper.get('label').trigger('click')
      expect(select).toHaveBeenCalledOnce()
    }
    finally { wrapper.unmount() }
  })

  it('keeps checkbox lists independent from native radio groups and blocks unavailable choices', async () => {
    const options = [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two', disabled: true }]
    const list = mount(HstCheckboxList, { props: { title: 'Many', modelValue: [], options } })
    const radio = mount(HstRadio, { props: { title: 'Single', modelValue: null, options } })
    try {
      expect(list.get('[role="group"]').attributes('aria-label')).toBe('Many')
      expect(radio.get('[role="radiogroup"]').attributes('aria-label')).toBe('Single')
      await list.get('input[value="one"]').setValue(true)
      await radio.get('input[value="one"]').setValue(true)
      await list.get('input[value="two"]').trigger('change')
      await radio.get('input[value="two"]').trigger('change')
      expect(list.emitted('update:modelValue')).toEqual([[['one']]])
      expect(radio.emitted('update:modelValue')).toEqual([['one']])
    }
    finally {
      list.unmount()
      radio.unmount()
    }
  })

  it('retains numeric segment values and blocks disabled options', async () => {
    const wrapper = mount(HstButtonGroup, { props: { modelValue: 1, options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }, { value: 3, label: 'Three', disabled: true }] } })
    try {
      expect(wrapper.get('button[aria-label="One"]').attributes('aria-pressed')).toBe('true')
      await wrapper.get('button[aria-label="Two"]').trigger('click')
      await wrapper.get('button[aria-label="Three"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')).toEqual([[2]])
    }
    finally { wrapper.unmount() }
  })
})
