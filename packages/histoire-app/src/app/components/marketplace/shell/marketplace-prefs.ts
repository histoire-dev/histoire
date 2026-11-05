import type { MarketplacePrefs } from '@histoire/shared'
import type { createUiSettingsStore, SettingsStorage } from '../../../stores/settings.js'
import { reactive } from 'vue'
import { marketplaceDefaults } from '../../../util/marketplace-preferences.js'

/** Hydrate one nested preference key without changing unrelated UI settings. */
export function createMarketplacePrefs(settings: ReturnType<typeof createUiSettingsStore>, storage?: SettingsStorage): MarketplacePrefs {
  const defaults = marketplaceDefaults()
  const state = settings.state
  let saved: unknown = state.marketplace
  try {
    saved ??= JSON.parse(storage?.getItem('_histoire-ui-settings') ?? '{}').marketplace
  }
  catch { /* Corrupt marketplace preferences never prevent opening the workbench. */ }
  if (saved && typeof saved === 'object') {
    const value = saved as Record<string, unknown>
    if (typeof value.community === 'boolean') defaults.community = value.community
    if (typeof value.packageManager === 'string' && ['auto', 'pnpm', 'npm', 'yarn', 'bun'].includes(value.packageManager)) defaults.packageManager = value.packageManager as MarketplacePrefs['packageManager']
    if (value.afterInstall === 'restart' || value.afterInstall === 'ask') defaults.afterInstall = value.afterInstall
    if (value.skippedVersions && typeof value.skippedVersions === 'object' && !Array.isArray(value.skippedVersions)) {
      defaults.skippedVersions = Object.fromEntries(Object.entries(value.skippedVersions).filter(([, version]) => typeof version === 'string'))
    }
  }
  // The settings owner serializes its entire reactive state on update, so the nested
  // value persists with the other UI preferences; its own hydration skips this key.
  state.marketplace = reactive(defaults)
  return state.marketplace
}
