import type { CatalogPage, CatalogQuery } from '../../../../histoire-shared/src/index.js'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createDebouncedCatalogClient } from '../../../../histoire-app/src/app/components/marketplace/browse/catalog-client.js'
import MarketplaceAll from '../../../../histoire-app/src/app/components/marketplace/browse/MarketplaceAll.vue'
import MarketplaceDiscover from '../../../../histoire-app/src/app/components/marketplace/browse/MarketplaceDiscover.vue'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { createMarketplaceTransport, flushCatalog } from '../utils/marketplace-transport.js'

/** Real bundled metadata supplies rows/facets, avoiding a second catalog fixture. */
export async function catalogPage(): Promise<CatalogPage> {
  const channel = createMarketplaceTransport()
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false } })
  const page = await client.catalog({ view: 'all', prefs: { community: false, packageManager: 'auto', afterInstall: 'restart', skippedVersions: {} } })
  page.project = { frameworks: ['vue'], signals: ['vue', 'vitest'] }
  return page
}

/** Mount owned screens with real store/client; only external UI channel is substituted. */
export async function browseFixture(view: CatalogQuery['view'] = 'all', options: { /** Verify an already wrapped client does not acquire a second debounce delay. */ debounce?: boolean } = {}) {
  const channel = createMarketplaceTransport()
  const storage = memoryStorage()
  const client = createMarketplaceClient({ transport: channel.transport })
  const store = createMarketplaceStore({ client: options.debounce ? createDebouncedCatalogClient(client) : client, storage, settings: createUiSettingsStore({ storage }) })
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    return () => store.view.value === 'discover' ? h(MarketplaceDiscover) : store.view.value === 'all' ? h(MarketplaceAll) : h('p', store.view.value)
  })
  const container = document.createElement('div')
  document.body.append(container)
  const wrapper = mount(Host, { attachTo: container })
  store.openMarketplace(view)
  await flushCatalog()
  await flushMicrotasks(5)
  /** Snapshot latest outbound request, including query and preferences. */
  function request() {
    return channel.sent.filter(item => item.event === 'histoire:ui:marketplace-catalog').at(-1)!
  }
  /** Settle actual client promise and Vue rendering after a correlated reply. */
  async function reply(page: CatalogPage): Promise<void> {
    await flushCatalog()
    channel.emit('histoire:ui:marketplace-catalog-result', { requestId: request().value.requestId, page })
    await flushMicrotasks(5)
    await nextTick()
  }
  /** Select through the real shared control and return its public choice labels. */
  async function selectSort(label: string): Promise<string[]> {
    await wrapper.get('button[aria-label="Sort plugins"]').trigger('click')
    let choices: HTMLElement[] = []
    await vi.waitFor(() => {
      choices = [...document.querySelectorAll<HTMLElement>('[role="listbox"][aria-label="Sort plugins"] [role="option"]')]
      if (!choices.length) throw new Error('Sort choices did not open')
    })
    const labels = choices.map(choice => choice.textContent!.trim())
    const choice = choices.find(choice => choice.textContent!.trim() === label)
    if (!choice) throw new Error(`Missing sort choice: ${label}`)
    choice.click()
    await nextTick()
    return labels
  }
  /** Dispose requests even when an assertion fails. */
  function dispose(): void {
    wrapper.unmount()
    container.remove()
    store.dispose()
  }
  return { store, channel, wrapper, request, reply, selectSort, dispose }
}
