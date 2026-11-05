import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import MarketplaceModal from '../../../../histoire-app/src/app/components/marketplace/shell/MarketplaceModal.vue'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { resizeObserverFixture } from '../fixtures/resize-observer.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'

/** Persistence shared across reopen scenarios in one isolated spec worker. */
export const storage = memoryStorage()

/** Mount real dialog/store/client; jsdom dialog API alone is a platform substitute. */
export function setup(cleanups: (() => unknown)[], withProvider = false) {
  const channel = createMarketplaceTransport()
  const client = createMarketplaceClient({ transport: channel.transport })
  const store = createMarketplaceStore({ client, settings: createUiSettingsStore({ storage }), storage })
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    return () => [h('button', {
      onClick: (event: MouseEvent) => store.openMarketplace('discover', event.currentTarget as HTMLElement),
    }, 'Browse marketplace'), h(MarketplaceModal)]
  })
  const container = document.createElement('div')
  document.body.append(container)
  // Settled detail metadata renders shared panel controls through their real host.
  const session = withProvider ? createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters) : undefined
  if (session) {
    resizeObserverFixture()
    cleanups.push(() => session.dispose())
  }
  const wrapper = session
    ? mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: container })
    : mount(Host, { attachTo: container })
  cleanups.push(() => {
    wrapper.unmount()
    container.remove()
  })
  const dialog = wrapper.get('dialog').element as HTMLDialogElement
  // jsdom has no top layer or native cancel behavior; browser proof is separate.
  dialog.showModal = () => {
    dialog.open = true
  }
  dialog.close = () => {
    dialog.open = false
    dialog.dispatchEvent(new Event('close'))
  }
  return { wrapper, store, channel, dialog }
}
