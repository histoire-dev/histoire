import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import ShellLayout from '../../../histoire-app/src/app/components/shell/ShellLayout.vue'
import { provideShell } from '../../../histoire-app/src/app/composables/shell.js'
import { createShell, SHELL_STORAGE_KEY } from '../../../histoire-app/src/app/stores/shell.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))

describe('home rail ownership', () => {
  it.each(['home', 'logo', 'external-logo'])('keeps pane state caller-owned through %s activation', async (action) => {
    window.localStorage.removeItem(SHELL_STORAGE_KEY)
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
    await session.connect()
    const shell = createShell({ dev: true, storage: window.localStorage })
    shell.selectPane('search')
    const homeActive = ref(true)
    const onHome = vi.fn()
    const host = defineComponent({
      setup() {
        provideShell(shell)
        return () => h(ShellLayout, { homeHref: '/', homeActive: homeActive.value, logoHref: action === 'external-logo' ? 'https://example.com/' : undefined, onHome }, { search: () => h('input') })
      },
    })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(host) } })
    try {
      expect(wrapper.get('[aria-label="Home"]').attributes('aria-pressed')).toBe('true')
      if (action === 'home') {
        expect(wrapper.findAll('[data-shell-pane][aria-pressed="true"]')).toHaveLength(1)
        expect(wrapper.get('[aria-label="Search"]').attributes('aria-expanded')).toBe('true')
        homeActive.value = false
        await nextTick()
        expect(wrapper.get('[aria-label="Home"]').attributes('aria-pressed')).toBe('false')
        expect(wrapper.get('[aria-label="Search"]').attributes('aria-pressed')).toBe('true')
        expect(wrapper.get('[aria-label="Search"]').attributes('aria-expanded')).toBe('true')
      }
      const control = wrapper.get(action === 'home' ? '[aria-label="Home"]' : '[aria-label="Histoire home"]')
      // A generic cancelable event observes interception without navigating jsdom.
      const click = new Event('click', { bubbles: true, cancelable: true })
      control.element.dispatchEvent(click)
      expect(onHome).toHaveBeenCalledTimes(action === 'external-logo' ? 0 : 1)
      expect(shell.pane.value).toBe('search')
      expect(shell.panelOpen.value).toBe(true)
      if (action !== 'home') {
        expect(click.defaultPrevented).toBe(action === 'logo')
        expect(control.attributes('href')).toBe(action === 'logo' ? '/' : 'https://example.com/')
        expect(control.attributes('target')).toBe(action === 'logo' ? undefined : '_blank')
      }
    }
    finally {
      wrapper.unmount()
      shell.close()
      await session.dispose()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
    }
  })
})
