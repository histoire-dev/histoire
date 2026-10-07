import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import ContextMenu from '../../../histoire-app/src/app/components/menu/ContextMenu.vue'
import { createContextMenu, provideContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { registerUiVisibilityAction } from '../../../histoire-app/src/app/standalone/ui-visibility-menu.js'
import { createShell } from '../../../histoire-app/src/app/stores/shell.js'
import { createShortcutRegistry, provideShortcutRegistry } from '../../../histoire-app/src/app/util/shortcuts.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('@histoire/vue', () => import('../index.js'))

describe('workbench UI context action', () => {
  it.each(['pointer', 'keyboard'] as const)('toggles chrome and restores menu focus through %s entry', async (entry) => {
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const selection = session.getSnapshot().selection
    const shell = createShell({ dev: true })
    const menu = createContextMenu()
    const shortcuts = createShortcutRegistry()
    const canvasRoute = ref(true)
    const toggle = vi.fn(() => {
      menu.close()
      shell.toggleUi()
    })
    const unregister = registerUiVisibilityAction(menu, {
      hidden: () => shell.uiHidden.value,
      available: () => shell.uiHidden.value || canvasRoute.value,
      toggle,
    })
    const Host = defineComponent({
      setup() {
        provideContextMenu(menu)
        provideShortcutRegistry(shortcuts)
        return () => h('div', [
          h('button', {
            'aria-label': 'Canvas menu',
            'onContextmenu': (event: MouseEvent) => menu.open(event, { kind: 'story', label: 'Story' }),
            'onKeydown': (event: KeyboardEvent) => menu.open(event, { kind: 'story', label: 'Story' }),
          }),
          h(ContextMenu),
        ])
      },
    })
    const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => h(Host) } })
    const anchor = wrapper.get('[aria-label="Canvas menu"]')
    /** Exercise menu entry through cancelable DOM events and real component handlers. */
    async function open() {
      if (entry === 'pointer') await anchor.trigger('contextmenu', { clientX: 20, clientY: 30 })
      else await anchor.trigger('keydown', { key: 'F10', shiftKey: true })
      await flushPromises()
    }
    try {
      await open()
      expect(wrapper.get('[role="menuitem"]').text()).toContain('Hide UI')
      expect(wrapper.get('[role="menuitem"]').text()).toContain(shortcuts.hint('global.toggle-ui'))
      await wrapper.get('[role="menuitem"]').trigger('click')
      expect(toggle).toHaveBeenCalledOnce()
      expect(shell.uiHidden.value).toBe(true)
      expect(menu.state.context).toBeNull()
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)

      canvasRoute.value = false
      await open()
      expect(wrapper.get('[role="menuitem"]').text()).toContain('Show UI')
      await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
      expect(shell.uiHidden.value).toBe(true)
      expect(document.activeElement).toBe(anchor.element)
      await open()
      await wrapper.get('[role="menuitem"]').trigger('click')
      expect(shell.uiHidden.value).toBe(false)
      expect(session.getSnapshot().selection).toEqual(selection)
      expect(shell.panelOpen.value).toBe(true)
      expect(shell.inspectorOpen.value).toBe(true)
      await open()
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    }
    finally {
      unregister()
      wrapper.unmount()
      shell.close()
      await session.dispose()
    }
  })

  it.each(['iframe', 'input', 'textarea', 'select', 'a', 'div'])('preserves native menu ownership on %s', (tag) => {
    const menu = createContextMenu()
    const element = document.createElement(tag)
    if (tag === 'a') element.setAttribute('href', '/')
    if (tag === 'div') element.setAttribute('contenteditable', 'true')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    element.addEventListener('contextmenu', event => menu.open(event, { kind: 'story', label: 'Story' }))
    element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(menu.state.context).toBeNull()
  })
})
