import type { MarketplacePrefs } from '@histoire/shared'

/** Fresh browser-local defaults for hydration and Settings reset. */
export function marketplaceDefaults(): MarketplacePrefs {
  return { community: false, packageManager: 'auto', afterInstall: 'restart', skippedVersions: {} }
}
