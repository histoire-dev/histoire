import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, toRaw } from 'vue'
import CustomSelect from './CustomSelect.vue'

/** Local popper animation is asynchronous; wait for its real focus publication. */
async function focused(label: string): Promise<void> {
  await vi.waitFor(() => {
    expect(document.activeElement?.getAttribute('role'), `Focused choice ${label}`).toBe('option')
    expect(document.activeElement?.textContent?.trim()).toBe(label)
  })
}

describe('local select keyboard contract', () => {
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
  beforeEach(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }))
  afterEach(() => {
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
    else delete (HTMLElement.prototype as any).scrollIntoView
  })

  it('navigates enabled options, retains exact values, and restores trigger focus', async () => {
    const object = { exact: true }
    const wrapper = mount(CustomSelect, { attachTo: document.body, attrs: { 'aria-label': 'Choice' }, props: { modelValue: 2, options: [{ value: 1, label: 'One', disabled: true }, { value: 2, label: 'Two' }, { value: object, label: 'Three' }] } })
    try {
      const trigger = wrapper.get('button[aria-haspopup]')
      ;(trigger.element as HTMLElement).focus()
      await trigger.trigger('keydown', { key: 'ArrowDown' })
      await focused('Two')
      const list = document.querySelector('[role="listbox"]')!
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      await focused('Three')
      ;(document.activeElement as HTMLElement).click()
      await nextTick()
      expect(toRaw(wrapper.emitted('update:modelValue')![0][0])).toBe(object)
      expect(document.activeElement).toBe(trigger.element)
      await trigger.trigger('keydown', { key: 'ArrowUp' })
      await focused('Two')
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
      await focused('Two')
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(document.activeElement).toBe(trigger.element)
      expect(trigger.attributes('aria-expanded')).toBe('false')
    }
    finally { wrapper.unmount() }
  })

  it('recovers when focused choice is disabled or removed while open', async () => {
    const wrapper = mount(CustomSelect, { attachTo: document.body, props: { options: [1, 2], modelValue: 2 } })
    try {
      await wrapper.get('button[aria-haspopup]').trigger('click')
      await focused('2')
      await wrapper.setProps({ options: [{ value: 1, label: '1' }, { value: 2, label: '2', disabled: true }] })
      await focused('1')
      await wrapper.setProps({ options: [] })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      await wrapper.setProps({ disabled: true })
      expect(wrapper.get('button[aria-haspopup]').attributes('aria-expanded')).toBe('false')
    }
    finally { wrapper.unmount() }
  })
})
