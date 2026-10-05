import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseOverflowToolbar from '../../../histoire-app/src/app/components/base/overflow/BaseOverflowToolbar.vue'
import BaseOverflowToolbarItem from '../../../histoire-app/src/app/components/base/overflow/BaseOverflowToolbarItem.vue'
import BasePopover from '../../../histoire-app/src/app/components/base/popover/BasePopover.vue'
import ToolbarButton from '../../../histoire-app/src/app/components/canvas/toolbar/ToolbarButton.vue'
import { toolbarGeometry } from './fixtures/toolbar-geometry.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

/** Stable fixture groups expose actual native action handlers and local state. */
function fixture(options: { available?: number, nested?: boolean } = {}) {
  const geometry = toolbarGeometry(options.available)
  const activated = vi.fn()
  const mounted = vi.fn()
  const retired = vi.fn()
  const width = ref(50)
  const extra = ref(false)
  const Child = defineComponent({
    setup() {
      const count = ref(0)
      const anchor = ref<HTMLButtonElement | null>(null)
      const open = ref(false)
      onMounted(mounted)
      onBeforeUnmount(retired)
      return () => options.nested
        ? h('span', [h('button', { 'ref': anchor, 'type': 'button', 'data-width': width.value, 'aria-haspopup': 'dialog', 'onClick': () => open.value = true }, 'Child panel'), h(BasePopover, { 'open': open.value, 'anchor': anchor.value, 'label': 'Child panel', 'onUpdate:open': (value: boolean) => open.value = value }, () => h('input', { 'aria-label': 'Draft', 'value': 'Retained' }))])
        : h(ToolbarButton, { 'label': 'Stateful', 'data-width': width.value, 'onClick': () => {
            activated()
            count.value++
          } }, () => String(count.value))
    },
  })
  const Host = defineComponent({
    setup: () => () => h('div', { class: 'toolbar-test-host' }, [
      h(BaseOverflowToolbar, { label: 'Test tools', overflowLabel: 'More tools' }, () => [
        h(BaseOverflowToolbarItem, { id: 'first' }, () => h(ToolbarButton, { 'label': 'First', 'data-width': 40 })),
        h(BaseOverflowToolbarItem, { id: 'second', separatorBefore: true }, () => h(Child)),
        h(BaseOverflowToolbarItem, { id: 'disabled' }, () => h(ToolbarButton, { 'label': 'Disabled', 'disabled': true, 'data-width': 30 })),
        extra.value ? h(BaseOverflowToolbarItem, { id: 'extra' }, () => h(ToolbarButton, { 'label': 'Extra', 'data-width': 30 })) : null,
      ]),
      h('button', { type: 'button' }, 'Outside'),
    ]),
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, geometry, activated, mounted, retired, width, extra }
}

describe('single-instance overflow toolbar', () => {
  it('measures trigger width while hidden before first overflow', async () => {
    const test = fixture()
    try {
      await test.geometry.flush()
      const trigger = test.wrapper.get<HTMLButtonElement>('button[aria-label="More tools"]').element
      trigger.dataset.width = '52'
      const rect = trigger.getBoundingClientRect()
      trigger.getBoundingClientRect = () => ({ ...rect, width: trigger.hidden ? 0 : 52 })
      test.geometry.resize(75)
      await test.geometry.flush(1)
      await nextTick()
      expect(trigger.hidden).toBe(false)
      expect(test.wrapper.get('.overflow-toolbar-items').element.querySelector('button')).toBeNull()
    }
    finally { test.wrapper.unmount() }
  })

  it('moves complete suffix groups, preserves state and recovers from hidden width', async () => {
    const test = fixture()
    try {
      await test.geometry.flush()
      expect(test.wrapper.find('button[aria-label="More tools"]:not([hidden])').exists()).toBe(false)
      const control = test.wrapper.get('button[aria-label="Stateful"]').element
      await test.wrapper.get('button[aria-label="Stateful"]').trigger('click')
      test.geometry.resize(100)
      await test.geometry.flush()
      await test.wrapper.get('button[aria-label="More tools"]').trigger('click')
      await test.geometry.flush()
      expect(document.querySelector('[role="menu"] button[aria-label="Stateful"]')).toBe(control)
      expect(control.textContent).toContain('1')
      control.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(test.activated).toHaveBeenCalledTimes(2)
      expect(test.wrapper.get('button[aria-label="More tools"]').attributes('aria-expanded')).toBe('false')
      test.geometry.resize(0)
      await test.geometry.flush()
      expect(test.wrapper.get('.overflow-toolbar-items').element.querySelector('button')).toBeNull()
      test.geometry.resize(300)
      await test.geometry.flush()
      expect(test.wrapper.get('button[aria-label="Stateful"]').element).toBe(control)
      expect(test.mounted).toHaveBeenCalledOnce()
      expect(test.retired).not.toHaveBeenCalled()
      expect(document.querySelector('[data-overflow-measurement]')).toBeNull()
    }
    finally { test.wrapper.unmount() }
    expect(test.retired).toHaveBeenCalledOnce()
    expect(test.geometry.pending()).toEqual({ frames: 0, observers: 0 })
  })

  it('reacts to dynamic content and skips disabled menu rows during keyboard traversal', async () => {
    const test = fixture({ available: 100 })
    try {
      await test.geometry.flush()
      test.extra.value = true
      await test.geometry.flush()
      const trigger = test.wrapper.get('button[aria-label="More tools"]')
      await trigger.trigger('keydown', { key: 'ArrowDown' })
      await test.geometry.flush()
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Stateful')
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Extra')
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Stateful')
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await test.geometry.flush()
      expect(document.activeElement).toBe(trigger.element)
      test.width.value = 5
      test.extra.value = false
      test.geometry.resize(100)
      await test.geometry.flush()
      expect(test.wrapper.find('button[aria-label="More tools"]:not([hidden])').exists()).toBe(false)
    }
    finally { test.wrapper.unmount() }
  })

  it('keeps parent open for child panels and unwinds Escape from deepest panel', async () => {
    const test = fixture({ available: 100, nested: true })
    try {
      await test.geometry.flush()
      const more = test.wrapper.get('button[aria-label="More tools"]')
      await more.trigger('click')
      await test.geometry.flush()
      const child = document.querySelector<HTMLButtonElement>('[role="menu"] button[aria-haspopup="dialog"]')!
      child.click()
      await test.geometry.flush()
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Draft"]')!
      input.value = 'Changed'
      input.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      expect(more.attributes('aria-expanded')).toBe('true')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await test.geometry.flush()
      expect(more.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(child)
      child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await test.geometry.flush()
      expect(more.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(more.element)
    }
    finally { test.wrapper.unmount() }
  })

  it('moves focus from disappearing inline controls without stealing unrelated focus', async () => {
    const test = fixture()
    try {
      await test.geometry.flush()
      test.wrapper.get('button[aria-label="Stateful"]').element.focus()
      test.geometry.resize(100)
      await test.geometry.flush()
      expect(document.activeElement?.getAttribute('aria-label')).toBe('More tools')
      const outside = test.wrapper.findAll('button').find(button => button.text() === 'Outside')!
      outside.element.focus()
      test.geometry.resize(300)
      await test.geometry.flush()
      expect(document.activeElement).toBe(outside.element)
    }
    finally { test.wrapper.unmount() }
  })

  it('returns dropdown focus to same inline control and resumes Tab after trigger', async () => {
    const test = fixture({ available: 100 })
    try {
      await test.geometry.flush()
      const more = test.wrapper.get('button[aria-label="More tools"]')
      await more.trigger('click')
      await test.geometry.flush()
      const original = document.activeElement
      test.geometry.resize(300)
      await test.geometry.flush()
      expect(document.activeElement).toBe(original)
      expect(more.attributes('hidden')).toBeDefined()
      test.geometry.resize(100)
      await test.geometry.flush()
      await more.trigger('click')
      await test.geometry.flush()
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      await test.geometry.flush()
      expect(document.activeElement?.textContent).toBe('Outside')
      expect(more.attributes('aria-expanded')).toBe('false')
    }
    finally { test.wrapper.unmount() }
  })

  it('keeps two toolbar partitions and Escape ownership independent', async () => {
    const geometry = toolbarGeometry()
    const widths = ref([100, 300])
    const Host = defineComponent({
      setup: () => () => h('div', widths.value.map((width, index) => h('div', { 'class': 'toolbar-test-host', 'data-available': width }, h(BaseOverflowToolbar, { label: `Tools ${index}`, overflowLabel: `More ${index}` }, () => [
        h(BaseOverflowToolbarItem, { id: 'first' }, () => h(ToolbarButton, { 'label': `First ${index}`, 'data-width': 40 })),
        h(BaseOverflowToolbarItem, { id: 'second' }, () => h(ToolbarButton, { 'label': `Second ${index}`, 'data-width': 70 })),
      ])))),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    try {
      await geometry.flush()
      expect(wrapper.get('button[aria-label="More 0"]').attributes('hidden')).toBeUndefined()
      expect(wrapper.get('button[aria-label="More 1"]').attributes('hidden')).toBeDefined()
      widths.value = [100, 100]
      geometry.resize(100)
      await geometry.flush()
      await wrapper.get('button[aria-label="More 0"]').trigger('click')
      await geometry.flush()
      await wrapper.get('button[aria-label="More 1"]').trigger('click')
      await geometry.flush()
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await geometry.flush()
      expect(wrapper.get('button[aria-label="More 0"]').attributes('aria-expanded')).toBe('true')
      expect(wrapper.get('button[aria-label="More 1"]').attributes('aria-expanded')).toBe('false')
    }
    finally { wrapper.unmount() }
  })

  it('closes descendant panels when all groups fit and focuses original trigger', async () => {
    const test = fixture({ available: 100, nested: true })
    try {
      await test.geometry.flush()
      await test.wrapper.get('button[aria-label="More tools"]').trigger('click')
      await test.geometry.flush()
      const trigger = document.querySelector<HTMLButtonElement>('[role="menu"] button[aria-haspopup="dialog"]')!
      trigger.click()
      await test.geometry.flush()
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Draft')
      test.geometry.resize(300)
      await test.geometry.flush()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    }
    finally { test.wrapper.unmount() }
  })

  it('focuses nearest enabled action after removal and ignores retired autofocus', async () => {
    const test = fixture()
    await test.geometry.flush()
    test.extra.value = true
    await test.geometry.flush()
    test.wrapper.get('button[aria-label="Extra"]').element.focus()
    test.extra.value = false
    await test.geometry.flush()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Stateful')
    test.geometry.resize(100)
    await test.geometry.flush()
    test.wrapper.get('button[aria-label="More tools"]').element.click()
    test.wrapper.unmount()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await test.geometry.flush()
    expect(document.activeElement).toBe(outside)
    expect(test.geometry.pending()).toEqual({ frames: 0, observers: 0 })
  })
})
