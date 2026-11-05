import type { PluginId } from '@histoire/shared'
import type { MarketplaceStore } from '../../../stores/marketplace.js'

/** Capture local preferences when entering review from a card or project recommendation. */
export function installPlugin(store: MarketplaceStore, id: PluginId): void {
  store.startInstall({ kind: 'install', id, prefs: { ...store.prefs.value, skippedVersions: { ...store.prefs.value.skippedVersions } } })
}
