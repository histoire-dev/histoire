import type { CatalogPage, CatalogQuery } from '../../../../histoire-shared/src/index.js'
import { vi } from 'vitest'
import { h, nextTick } from 'vue'
import MarketplaceAll from '../../../../histoire-app/src/app/components/marketplace/browse/MarketplaceAll.vue'
import MarketplaceDiscover from '../../../../histoire-app/src/app/components/marketplace/browse/MarketplaceDiscover.vue'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { marketplaceDefaults } from '../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { createMarketplaceTransport, flushCatalog, lastRequest, mountMarketplace } from '../utils/marketplace-transport.js'

/** Real bundled metadata supplies rows/facets, avoiding a second catalog fixture. */
export async function catalogPage(): Promise<CatalogPage> {
  const channel = createMarketplaceTransport()
  const client = createMarketplaceClient({ transport: { ...channel.transport, available: () => false } })
  const page = await client.catalog({ view: 'all', prefs: marketplaceDefaults() })
  page.project = { frameworks: ['vue'], signals: ['vue', 'vitest'] }
  return page
}

/** Mount owned screens with real store/client; only external UI channel is substituted. */
export async function browseFixture(view: CatalogQuery['view'] = 'all') {
  const { channel, store, wrapper, dispose } = mountMarketplace({
    provider: false,
    render: store => store.view.value === 'discover' ? h(MarketplaceDiscover) : store.view.value === 'all' ? h(MarketplaceAll) : h('p', store.view.value),
  })
  store.openMarketplace(view)
  await flushCatalog()
  await flushMicrotasks(5)
  /** Snapshot latest outbound request, including query and preferences. */
  function request() {
    return lastRequest(channel, 'catalog')
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
  return { store, channel, wrapper, request, reply, selectSort, dispose }
}
