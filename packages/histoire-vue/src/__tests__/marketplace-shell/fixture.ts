import { h } from 'vue'
import MarketplaceModal from '../../../../histoire-app/src/app/components/marketplace/shell/MarketplaceModal.vue'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { mountMarketplace } from '../utils/marketplace-transport.js'

/** Persistence shared across reopen scenarios in one isolated spec worker. */
export const storage = memoryStorage()

/** Mount real dialog/store/client; jsdom dialog API alone is a platform substitute. */
export function setup(cleanups: (() => unknown)[], withProvider = false) {
  const fixture = mountMarketplace({
    storage,
    provider: withProvider,
    render: store => [h('button', {
      onClick: (event: MouseEvent) => store.openMarketplace('discover', event.currentTarget as HTMLElement),
    }, 'Browse marketplace'), h(MarketplaceModal)],
  })
  cleanups.push(fixture.dispose)
  const dialog = fixture.wrapper.get<HTMLDialogElement>('dialog').element
  return { ...fixture, dialog }
}
