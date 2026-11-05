import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import SettingsNav from '../../../../histoire-app/src/app/components/pages/settings/SettingsNav.vue'
import AppRail from '../../../../histoire-app/src/app/components/shell/AppRail.vue'
import { provideShell } from '../../../../histoire-app/src/app/composables/shell.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createShell } from '../../../../histoire-app/src/app/stores/shell.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { HistoireProvider } from '../../provider/HistoireProvider.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'
import { updates } from './data.js'

vi.mock('@histoire/vue/internal', () => import('../../internal.js'))

it('loads updates on startup, retains session cache, filters skipped targets and clears rail count', async () => {
  const channel = createMarketplaceTransport()
  const storage = memoryStorage()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters)
  const shell = createShell({ dev: true, storage })
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings: createUiSettingsStore({ storage }), storage })
  const shown = ref(true)
  const Host = defineComponent(() => {
    provideShell(shell)
    provideMarketplaceStore(store)
    return () => shown.value ? [h(AppRail, { panelId: 'panes', homeHref: '/', settingsAvailable: true }), h(SettingsNav, { section: 'appearance', dev: true })] : null
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) } })
  try {
    const requests = () => channel.sent.filter(item => item.event === 'histoire:ui:marketplace-updates')
    expect(requests()).toHaveLength(1)
    expect(requests()[0].value.prefs.community).toBe(false)
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true)
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: requests()[0].value.requestId, updates })
    await flushMicrotasks(10)
    expect(wrapper.find('[aria-label="Settings (3)"]').exists()).toBe(true)
    expect(wrapper.get('nav [aria-label="Plugins, 3 updates available"]').text()).toBe('Plugins 3')
    shown.value = false
    await nextTick()
    shown.value = true
    await nextTick()
    expect(requests()).toHaveLength(1)
    expect(wrapper.find('[aria-label="Settings (3)"]').exists()).toBe(true)
    expect(wrapper.get('nav [aria-label="Plugins, 3 updates available"]').text()).toBe('Plugins 3')
    store.prefs.value.skippedVersions = Object.fromEntries(updates.map(item => [item.id, item.to]))
    await nextTick()
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true)
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: requests()[1].value.requestId, updates: [] })
    await flushMicrotasks(10)
    store.prefs.value.skippedVersions = {}
    await nextTick()
    expect(requests()).toHaveLength(3)
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: requests()[2].value.requestId, updates })
    await flushMicrotasks(10)
    expect(wrapper.find('[aria-label="Settings (3)"]').exists()).toBe(true)
    expect(wrapper.get('nav [aria-label="Plugins, 3 updates available"]').text()).toBe('Plugins 3')
    store.prefs.value.community = true
    await nextTick()
    expect(requests()).toHaveLength(4)
    wrapper.unmount()
    store.dispose()
    expect(channel.listenerCount()).toBe(0)
    channel.emit('histoire:ui:marketplace-updates-result', { requestId: requests()[3].value.requestId, updates })
  }
  finally {
    wrapper.unmount()
    store.dispose()
    shell.close()
    await session.dispose()
  }
})
