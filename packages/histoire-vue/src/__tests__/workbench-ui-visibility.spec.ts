import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createContextMenu } from '../../../histoire-app/src/app/composables/context-menu.js'
import { useWorkbenchUiVisibility } from '../../../histoire-app/src/app/standalone/ui-visibility.js'
import { createShell } from '../../../histoire-app/src/app/stores/shell.js'
import { createShortcutRegistry } from '../../../histoire-app/src/app/util/shortcuts.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { requestHistoireUiShow, requestHistoireUiToggle } from '../provider/shortcuts.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))

/** Mount the real visibility lifecycle, shell and registry, with native input controls. */
async function visibilityFixture(dev: boolean) {
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  const shell = createShell({ dev })
  const shortcuts = createShortcutRegistry()
  const menu = createContextMenu()
  const canHide = ref(true)
  const commenting = ref(true)
  const active = ref(true)
  const Host = defineComponent({
    setup() {
      const toggle = useWorkbenchUiVisibility({ shell, shortcuts, menu, canHide: () => canHide.value, beforeToggle: () => commenting.value = false })
      return () => h('div', { onKeydown: (event: KeyboardEvent) => shortcuts.handle(event, ['global'], dev) }, [
        !shell.uiHidden.value && h('button', { onClick: toggle }, 'Hide UI'),
        h('div', { class: 'histoire-canvas-viewport', tabindex: 0 }, [
          h('input', { 'aria-label': 'Story text' }),
        ]),
      ])
    },
  })
  try {
    await session.connect()
    const wrapper = mount(HistoireProvider, { props: { session }, attachTo: document.body, slots: { default: () => active.value ? h(Host) : null } })
    return { wrapper, shell, shortcuts, menu, canHide, commenting, active,
      /** Release mounted resources before disposing their owning session. */
      async close() {
        wrapper.unmount()
        shell.close()
        await session.dispose()
      } }
  }
  catch (error) {
    shell.close()
    await session.dispose()
    throw error
  }
}

describe('workbench UI restoration', () => {
  it.each([true, false])('restores once on Escape with editable focus, preserving preferences (dev=%s)', async (dev) => {
    const fixture = await visibilityFixture(dev)
    const { wrapper, shell, commenting, canHide } = fixture
    try {
      shell.toggleInspector()
      await wrapper.get('button').trigger('click')
      expect(wrapper.findAll('button').map(button => button.text())).not.toContain('Hide UI')
      expect(commenting.value).toBe(false)
      canHide.value = false
      const input = wrapper.get('input')
      await input.setValue('Retained edit')
      ;(input.element as HTMLInputElement).focus()
      await input.trigger('keydown', { key: 'Escape' })
      expect(wrapper.get('button').text()).toBe('Hide UI')
      expect(shell.uiHidden.value).toBe(false)
      expect(document.activeElement).toBe(input.element)
      expect((input.element as HTMLInputElement).value).toBe('Retained edit')
      expect(shell.panelOpen.value).toBe(true)
      expect(shell.inspectorOpen.value).toBe(false)
      await input.trigger('keydown', { key: 'Escape' })
      expect(shell.uiHidden.value).toBe(false)
    }
    finally { await fixture.close() }
  })

  it('yields to handled, modified and repeated Escape before restoring', async () => {
    const fixture = await visibilityFixture(true)
    const { wrapper, shell } = fixture
    try {
      await wrapper.get('button').trigger('click')
      const input = wrapper.get('input')
      for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { repeat: true }]) {
        await input.trigger('keydown', { key: 'Escape', ...modifiers })
        expect(shell.uiHidden.value).toBe(true)
      }
      input.element.addEventListener('keydown', event => event.preventDefault(), { once: true })
      await input.trigger('keydown', { key: 'Escape' })
      expect(shell.uiHidden.value).toBe(true)
      input.element.addEventListener('keydown', event => event.stopPropagation(), { once: true })
      await input.trigger('keydown', { key: 'Escape' })
      expect(shell.uiHidden.value).toBe(true)
      await input.trigger('keydown', { key: 'Escape' })
      expect(shell.uiHidden.value).toBe(false)
    }
    finally { await fixture.close() }
  })

  it('owns iframe intents exactly and retires listeners and shortcuts with child scope', async () => {
    const fixture = await visibilityFixture(true)
    let other: Awaited<ReturnType<typeof visibilityFixture>> | undefined
    const { wrapper, shell, active, shortcuts } = fixture
    const nested = document.createElement('div')
    nested.className = 'histoire-provider'
    wrapper.element.append(nested)
    try {
      other = await visibilityFixture(false)
      requestHistoireUiToggle(wrapper.element as HTMLElement)
      await nextTick()
      expect(shell.uiHidden.value).toBe(true)
      requestHistoireUiShow(other.wrapper.element as HTMLElement)
      requestHistoireUiShow(nested)
      expect(shell.uiHidden.value).toBe(true)
      // Even an explicitly bubbling child intent cannot acquire parent authority.
      nested.dispatchEvent(new Event('histoire:show-ui', { bubbles: true, cancelable: true }))
      expect(shell.uiHidden.value).toBe(true)
      requestHistoireUiShow(wrapper.element as HTMLElement)
      requestHistoireUiShow(wrapper.element as HTMLElement)
      expect(shell.uiHidden.value).toBe(false)
      requestHistoireUiToggle(wrapper.element as HTMLElement)
      active.value = false
      await nextTick()
      requestHistoireUiShow(wrapper.element as HTMLElement)
      requestHistoireUiToggle(wrapper.element as HTMLElement)
      expect(shell.uiHidden.value).toBe(true)
      expect(shortcuts.entries.has('global.show-ui')).toBe(false)
      expect(shortcuts.entries.has('global.toggle-ui')).toBe(false)
    }
    finally {
      nested.remove()
      await fixture.close()
      await other?.close()
    }
  })
})
