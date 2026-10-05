import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onBeforeUnmount, onUpdated, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import SearchMatchStepper from '../../../histoire-app/src/app/components/canvas/toolbar/SearchMatchStepper.vue'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { watchDismissedPanelFocus } from '../../../histoire-app/src/app/components/shell/panel-focus.js'
import ShellLayout from '../../../histoire-app/src/app/components/shell/ShellLayout.vue'
import { provideShell } from '../../../histoire-app/src/app/composables/shell.js'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createShell, SHELL_STORAGE_KEY } from '../../../histoire-app/src/app/stores/shell.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))
vi.mock('virtual:$histoire-commands', () => ({ registeredCommands: [] }))
vi.mock('virtual:$histoire-stories', () => ({ files: [], onUpdate: () => () => {} }))

describe('workbench Search focus and controls', () => {
  it.each(['rail', 'expand', 'restore'])('focuses search input when opening through %s', async (entry) => {
    window.localStorage.removeItem(SHELL_STORAGE_KEY)
    if (entry === 'restore') window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ pane: 'search', panelOpen: true }))
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const commands = createStandaloneCommands(session, router)
    const shell = createShell({ dev: true, storage: window.localStorage })
    if (entry === 'expand') {
      shell.selectPane('search')
      shell.togglePanel()
    }
    const host = defineComponent({
      setup() {
        provideShell(shell)
        return () => h(ShellLayout, { homeHref: '/' }, {
          search: () => h(SearchPanel, { commands }),
        })
      },
    })
    const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(host) } })
    try {
      if (entry !== 'restore') {
        const button = wrapper.get(entry === 'rail' ? '[data-test-id=search-btn]' : '[aria-label="Expand side panel"]')
        const element = button.element as HTMLButtonElement
        element.focus()
        await button.trigger('click')
      }
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(wrapper.get('input[type=search]').element)

      // Reopening creates a fresh input after the active rail button dismisses it.
      const rail = wrapper.get('[data-test-id=search-btn]')
      await rail.trigger('click')
      expect(wrapper.find('input[type=search]').exists()).toBe(false)
      await rail.trigger('click')
      await nextTick()
      expect(document.activeElement).toBe(wrapper.get('input[type=search]').element)
    }
    finally {
      wrapper.unmount()
      shell.close()
      commands.close()
      await session.dispose()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })

  it.each(['sibling', 'nested'])('does not restore focus owned by %s provider', async (kind) => {
    const open = ref(true)
    const host = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        const rail = ref<HTMLElement | null>(null)
        const stop = watchDismissedPanelFocus({ getRoot: () => root.value, isOpen: () => open.value, getDestination: () => rail.value })
        onBeforeUnmount(stop)
        return () => h('div', { ref: root, class: 'histoire-provider' }, [h('button', { ref: rail }, 'Search'), open.value && h('input'), kind === 'nested' && h('div', { class: 'histoire-provider' }, h('button', { id: 'other-search-owner' }, 'Other'))])
      },
    })
    const wrapper = mount(host, { attachTo: document.body })
    const sibling = document.createElement('div')
    sibling.className = 'histoire-provider'
    sibling.innerHTML = '<button>Other</button>'
    document.body.append(sibling)
    const other = kind === 'nested' ? wrapper.get('#other-search-owner').element as HTMLButtonElement : sibling.querySelector('button')!
    try {
      other.focus()
      open.value = false
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(other)
    }
    finally {
      wrapper.unmount()
      sibling.remove()
    }
  })

  it('keeps newly claimed focus after removing owned panel input', async () => {
    const open = ref(true)
    const host = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        const rail = ref<HTMLElement | null>(null)
        const nextControl = ref<HTMLElement | null>(null)
        const stop = watchDismissedPanelFocus({ getRoot: () => root.value, isOpen: () => open.value, getDestination: () => rail.value })
        onUpdated(() => {
          if (!open.value) nextControl.value?.focus()
        })
        onBeforeUnmount(stop)
        return () => h('div', { ref: root, class: 'histoire-provider' }, [h('button', { ref: rail }, 'Search'), h('button', { ref: nextControl, id: 'next-control' }, 'Stories'), open.value && h('input')])
      },
    })
    const wrapper = mount(host, { attachTo: document.body })
    try {
      wrapper.get('input').element.focus()
      open.value = false
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(wrapper.get('#next-control').element)
    }
    finally { wrapper.unmount() }
  })

  it('exposes native previous/next controls and live count only for matching frames', async () => {
    const wrapper = mount(SearchMatchStepper, { props: { count: 3, position: 1 } })
    expect(wrapper.get('[role=status]').text()).toBe('1 / 3')
    await wrapper.get('[aria-label="Previous search match"]').trigger('click')
    await wrapper.get('[aria-label="Next search match"]').trigger('click')
    expect(wrapper.emitted('previous')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
    await wrapper.setProps({ count: 0, position: 0 })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
})
