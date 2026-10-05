import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireDropdown, HistoireTooltip } from '../foundation/floating.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

vi.mock('floating-vue', async () => {
  const { cloneVNode, defineComponent, h, ref } = await import('vue')
  // Positioning belongs to real browser gates; this stub exposes only the
  // third-party show/hide lifecycle that owns our focus restoration.
  /** Component defaults preserve dropdown versus non-focusable tooltip behavior. */
  function createFloating(autoHide: boolean) {
    return defineComponent({
      name: 'FocusFloatingFixture',
      props: { noAutoFocus: Boolean, autoHide: { type: Boolean, default: autoHide } },
      emits: ['show', 'hide', 'apply-show'],
      setup(props, { emit, slots, expose }) {
        const popper = ref<HTMLElement | null>(null)
        expose({
          hide: () => emit('hide'),
          onResize: () => {},
          /** Mirrors vendor's deferred autofocus, including its late hidden focus. */
          async showAfter(wait: Promise<void>) {
            emit('show')
            emit('apply-show')
            await wait
            if (!props.noAutoFocus) popper.value?.focus()
          },
        })
        return () => h('div', [
          ...slots.default?.().map(node => cloneVNode(node, { 'aria-describedby': 'fixture-popper' })) ?? [],
          h('div', { ref: popper, id: 'fixture-popper', tabindex: props.autoHide ? 0 : undefined }, 'Popper'),
        ])
      },
    })
  }
  return { Dropdown: createFloating(true), Tooltip: createFloating(false) }
})

describe('local floating trigger focus ownership', () => {
  it('restores its trigger after a click leaves another provider control focused', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, {
      props: { session },
      slots: { default: () => [h('button', 'Previous control'), h(HistoireDropdown, {}, { default: () => h('button', 'Menu trigger') })] },
      attachTo: document.body,
    })
    const outside = vi.fn()
    document.body.addEventListener('keydown', outside)
    try {
      const previous = wrapper.get('button').element
      const trigger = wrapper.findAll('button')[1].element
      previous.focus()
      // Firefox pointer activation can emit show without moving activeElement.
      wrapper.findComponent({ name: 'FocusFloatingFixture' }).vm.$emit('show')
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      previous.dispatchEvent(escape)
      expect(document.activeElement).toBe(trigger)
      expect(escape.defaultPrevented).toBe(true)
      expect(outside).not.toHaveBeenCalled()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(outside).toHaveBeenCalledOnce()
    }
    finally {
      document.body.removeEventListener('keydown', outside)
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('preserves the focused keyboard origin inside its own trigger wrapper', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, {
      props: { session },
      slots: { default: () => h(HistoireDropdown, {}, { default: () => [h('button', 'First trigger'), h('button', 'Keyboard trigger')] }) },
      attachTo: document.body,
    })
    try {
      const [first, keyboard] = wrapper.findAll('button').map(button => button.element)
      keyboard.focus()
      wrapper.findComponent({ name: 'FocusFloatingFixture' }).vm.$emit('show')
      first.focus()
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(keyboard)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })

  it('does not let deferred vendor autofocus steal focus after Escape closes menu', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireDropdown, {}, { default: () => h('button', 'Trigger') }) }, attachTo: document.body })
    const pending = deferred<void>()
    const floating = wrapper.findComponent({ name: 'FocusFloatingFixture' })
    try {
      const trigger = wrapper.get('button').element
      trigger.focus()
      const showing = (floating.vm.$.exposed as { showAfter: (wait: Promise<void>) => Promise<void> }).showAfter(pending.promise)
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      pending.resolve()
      await showing
      await nextTick()
      expect(document.activeElement).toBe(trigger)
    }
    finally {
      pending.resolve()
      wrapper.unmount()
      await session.dispose()
    }
  })

  it.each([
    { label: 'dropdown', component: HistoireDropdown, optOut: false, focused: true },
    { label: 'tooltip', component: HistoireTooltip, optOut: false, focused: false },
    { label: 'caller-managed dropdown', component: HistoireDropdown, optOut: true, focused: false },
  ])('preserves $label opening focus policy', async ({ component, optOut, focused }) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(component, { noAutoFocus: optOut }, { default: () => h('button', 'Trigger') }) }, attachTo: document.body })
    try {
      const trigger = wrapper.get('button').element
      trigger.focus()
      const floating = wrapper.findComponent({ name: 'FocusFloatingFixture' })
      await (floating.vm.$.exposed as { showAfter: (wait: Promise<void>) => Promise<void> }).showAfter(Promise.resolve())
      await nextTick()
      expect(document.activeElement).toBe(focused ? wrapper.get('#fixture-popper').element : trigger)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
