import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import MenuItem from '../../../histoire-app/src/app/components/menu/MenuItem.vue'
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
    return () => h('dialog', { ref: dialog, open: true }, h(WorkbenchPanelAction, {
      icon: 'play-filled-alt',
      label: 'Run',
      ...(target === 'omitted' ? {} : { overlayTarget: target === 'null' ? null : dialog.value }),
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
