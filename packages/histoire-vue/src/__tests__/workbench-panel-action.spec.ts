import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import BasePopover from '../../../histoire-app/src/app/components/base/popover/BasePopover.vue'
import { providePopoverOverlay } from '../../../histoire-app/src/app/components/base/popover/overlay.js'
import MenuItem from '../../../histoire-app/src/app/components/menu/MenuItem.vue'
import SubMenu from '../../../histoire-app/src/app/components/menu/SubMenu.vue'
import WorkbenchPanelAction from '../../../histoire-app/src/app/components/shell/WorkbenchPanelAction.vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

// Boundary: real provider/action/popover/menu. Wrong teleport target strands dialog
// actions behind native top layer; fallback must keep existing provider consumers local.
it.each(['omitted', 'null', 'dialog'] as const)('opens usable menu in %s overlay target', async (target) => {
  resizeObserverFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  cleanups.push(() => session.dispose())
  let provider: ReturnType<typeof useHistoireContext>
  let selected = ''
  const dialog = shallowRef<HTMLDialogElement | null>(null)
  const Host = defineComponent(() => {
    provider = useHistoireContext()
    if (target !== 'omitted') providePopoverOverlay(target === 'dialog' ? dialog : shallowRef(null))
    return () => h('dialog', { ref: dialog, open: true }, h(WorkbenchPanelAction, {
      icon: 'play-filled-alt',
      label: 'Run',
    }, {
      menu: ({ close }: { close: () => void }) => h(MenuItem, { label: 'Run all', onClick: () => {
        selected = 'all'
        close()
      } }),
    }))
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: document.body })
  cleanups.push(() => wrapper.unmount())
  await nextTick()
  await wrapper.get('button[aria-label="Run options"]').trigger('click')
  await nextTick()
  const expected = target === 'dialog' ? dialog.value : provider!.overlay.value
  const menu = expected?.querySelector('[role="menu"]')
  expect(menu, 'Menu must belong to requested surface').toBeTruthy()
  expect(menu?.parentElement).toBe(expected)
  const item = menu!.querySelector<HTMLButtonElement>('[role="menuitem"]')!
  expect(item.textContent).toBe('Run all')
  expect(document.activeElement).toBe(item)
  item.click()
  await nextTick()
  expect(selected).toBe('all')
  expect(expected?.querySelector('[role="menu"]')).toBeNull()
})

// BasePopover owns default surface selection, including callers without prop plumbing.
it('keeps a bare popover inside provider overlay', async () => {
  resizeObserverFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  cleanups.push(() => session.dispose())
  let provider: ReturnType<typeof useHistoireContext>
  const anchor = shallowRef<HTMLElement | null>(null)
  const Host = defineComponent(() => {
    provider = useHistoireContext()
    return () => h('div', [
      h('button', { ref: anchor }, 'Open'),
      h(BasePopover, { open: true, anchor: anchor.value, label: 'Local actions', role: 'menu' }, () => h(MenuItem, { label: 'Inspect' })),
    ])
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: document.body })
  cleanups.push(() => wrapper.unmount())
  await nextTick()
  expect(provider!.overlay.value?.querySelector('[aria-label="Local actions"]')?.parentElement).toBe(provider!.overlay.value)
})

// Nested menus own their keys; parent navigation must skip disabled/hidden descendants.
it('opens from arrows, skips unavailable rows and leaves child-menu navigation scoped', async () => {
  resizeObserverFixture()
  const selected: string[] = []
  const wrapper = mount(WorkbenchPanelAction, { props: { icon: 'play-filled-alt', label: 'Run' }, attachTo: document.body, slots: {
    menu: () => [
      h(MenuItem, { label: 'First', onClick: () => selected.push('first') }),
      h(MenuItem, { label: 'Unavailable', disabled: 'Not ready' }),
      h('div', { hidden: true }, h(MenuItem, { label: 'Hidden' })),
      h('a', { href: '#last', role: 'menuitem', tabindex: -1 }, 'Last'),
      h('div', { 'role': 'menu', 'aria-label': 'Child' }, h(MenuItem, { label: 'Child action' })),
    ],
  } })
  cleanups.push(() => wrapper.unmount())
  const trigger = wrapper.get('button[aria-label="Run options"]')
  await trigger.trigger('keydown', { key: 'ArrowUp' })
  const menu = document.querySelector<HTMLElement>('[aria-label="Run options"][role="menu"]')!
  expect(document.activeElement?.textContent).toBe('Last')
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement?.textContent).toBe('First')
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  expect(document.activeElement?.textContent).toBe('Last')
  const child = menu.querySelector<HTMLButtonElement>('[aria-label="Child"] button')!
  child.focus()
  child.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(child)
  menu.querySelector<HTMLButtonElement>('button')!.focus()
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  expect(document.activeElement?.textContent).toBe('First')
  ;(document.activeElement as HTMLElement).click()
  expect(selected).toEqual(['first'])
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  await nextTick()
  expect(document.querySelector('[aria-label="Run options"][role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(trigger.element)
})

// Submenu Tab must reach the root dismissal policy; Left returns to its parent row.
it('returns from a real submenu and dismisses the entire menu on Tab', async () => {
  resizeObserverFixture()
  const wrapper = mount(WorkbenchPanelAction, { props: { icon: 'play-filled-alt', label: 'Run' }, attachTo: document.body, slots: {
    menu: () => h(SubMenu, {
      action: { id: 'copy', label: 'Copy', icon: 'copy', run: () => {} },
      items: [{ id: 'copy-json', label: 'Copy JSON', icon: 'copy', run: () => {} }],
      target: { storyId: 'a:b', variantId: 'c', frameKey: 'frame-1' },
    }),
  } })
  cleanups.push(() => wrapper.unmount())
  const trigger = wrapper.get('button[aria-label="Run options"]')
  await trigger.trigger('keydown', { key: 'ArrowDown' })
  const parent = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"][role="menuitem"]')!
  expect(document.activeElement).toBe(parent)
  parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
  await nextTick()
  expect(document.activeElement?.textContent?.trim()).toBe('Copy JSON')
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
  await nextTick()
  expect(document.activeElement).toBe(parent)
  expect(document.querySelector('[role="menu"][aria-label="Copy"]')).toBeNull()
  expect(document.querySelector('[role="menu"][aria-label="Run options"]')).toBeTruthy()
  parent.click()
  await nextTick()
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  await nextTick()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(trigger.element)
})
