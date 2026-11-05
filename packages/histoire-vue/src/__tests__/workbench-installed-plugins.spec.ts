import type { WorkbenchPluginApi } from '../../../histoire-plugin-kit/src/index.js'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import SettingsPage from '../../../histoire-app/src/app/components/pages/settings/SettingsPage.vue'
import { provideExtensionHost } from '../../../histoire-app/src/app/composables/extensions.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../histoire-app/src/app/util/marketplace-client.js'
import { getHistoireIcon } from '../../../histoire-shared/src/icons/index.js'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { createTestWorkbenchHost, pluginEntry } from '../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'
import { createMarketplaceTransport } from './utils/marketplace-transport.js'

vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {}, installedPlugins: [
  { name: 'builtin:vanilla-support', builtin: true, client: false, frame: false },
  { name: 'example', builtin: false, id: 'acme', client: true, frame: false, enabled: true, toggleId: '11111111-1111-4111-8111-111111111111', displayName: 'Acme', description: 'Useful plugin', icon: 'settings', logoUrl: 'https://example.com/logo.svg', docsUrl: 'https://example.com/docs', repoUrl: 'https://example.com/repo' },
  { name: 'example', builtin: false, client: false, frame: false },
] }))

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.removeItem('_histoire-plugin-change:/')
})

it('lists configured plugins and opens the associated settings section', async () => {
  resizeObserverFixture()
  const storage = memoryStorage()
  const channel = createMarketplaceTransport()
  const marketplace = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage }), storage })
  cleanups.push(marketplace.dispose)
  const plugin = { id: 'acme', apiVersion: 1 as const, setup(api: WorkbenchPluginApi) {
    api.settings.addSection({ id: 'prefs', label: 'Acme settings', icon: 'settings', mount: () => {} })
  } }
  const { workbench } = createTestWorkbenchHost({ plugins: [pluginEntry(plugin)] })
  cleanups.push(() => workbench.dispose())
  const Parent = defineComponent((_props, { emit }) => {
    provideExtensionHost(workbench)
    provideMarketplaceStore(marketplace)
    return () => h(SettingsPage, { section: 'plugins', onSection: (value: string) => emit('section', value) })
  }, { emits: ['section'] })
  const wrapper = mount(Parent, { attachTo: document.body })
  cleanups.push(() => wrapper.unmount())
  await workbench.host.ready
  await flushMicrotasks(30)
  await vi.waitFor(() => expect(wrapper.get('main h1').text()).toBe('Plugins'))

  const puzzlePath = /d="([^"]+)"/.exec(getHistoireIcon('puzzle')!.body)![1]
  expect(wrapper.get('nav [aria-current="page"] svg path').attributes('d')).toBe(puzzlePath)
  expect(wrapper.get('main').text()).toContain('builtin:vanilla-support')
  expect(wrapper.get('main').text()).toContain('Built in')
  expect(wrapper.findAll('main strong').map(item => item.text())).toEqual(['builtin:vanilla-support', 'Acme', 'example', 'Community plugins', 'Package manager', 'After install'])
  expect(wrapper.get('main').text()).toContain('Useful plugin')
  expect(wrapper.get('main img').attributes('alt')).toBe('')
  await wrapper.get('button[aria-label="More actions for Acme"]').trigger('click')
  await flushMicrotasks(10)
  const docs = document.querySelector('a[aria-label="Documentation for Acme"]')!
  expect(docs).not.toBeNull()
  expect(docs.getAttribute('href')).toBe('https://example.com/docs')
  expect(docs.getAttribute('target')).toBe('_blank')
  expect(docs.getAttribute('rel')).toBe('noopener noreferrer')
  expect(document.querySelector('a[aria-label="Repository for Acme"]')?.getAttribute('href')).toBe('https://example.com/repo')
  await wrapper.get('button[aria-label="More actions for Acme"]').trigger('click')
  await wrapper.get('main button[aria-label="Settings: Acme settings"]').trigger('click')
  expect(wrapper.emitted('section')).toEqual([['acme:prefs']])

  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Config changed on disk. Reload settings.' }), { status: 400, headers: { 'content-type': 'application/json' } }))
  const toggle = wrapper.get('main input[role="switch"][aria-label="Enable Acme"]')
  await toggle.setValue(false)
  expect(network).not.toHaveBeenCalled()
  expect(wrapper.get('[aria-label="Plugin changes"]').text()).toContain('1 change')
  await wrapper.findAll('button').find(button => button.text() === 'Discard')!.trigger('click')
  expect((toggle.element as HTMLInputElement).checked).toBe(true)
  expect(network).not.toHaveBeenCalled()
  await toggle.setValue(false)
  await wrapper.findAll('button').find(button => button.text() === 'Apply and restart')!.trigger('click')
  await flushMicrotasks(10)
  expect(network).toHaveBeenCalledTimes(1)
  const body = JSON.parse(String(network.mock.calls[0][1]?.body))
  expect(body).toMatchObject({ action: 'apply', changes: [{ id: '11111111-1111-4111-8111-111111111111', enabled: false }] })
  expect(wrapper.get('[role="alert"]').text()).toContain('Config changed on disk')
})
