import type { MarketplacePrefs } from '@histoire/shared'
import { packageManagers } from '@histoire/shared'
import { marketplaceDefaults } from '../../../util/marketplace-preferences.js'

/** Validate saved marketplace fields independently, preserving valid preferences. */
export function validateMarketplacePrefs(saved: unknown): MarketplacePrefs {
  const defaults = marketplaceDefaults()
  if (saved && typeof saved === 'object') {
    const value = saved as Record<string, unknown>
    if (typeof value.community === 'boolean') defaults.community = value.community
    if (typeof value.packageManager === 'string' && (packageManagers as readonly string[]).includes(value.packageManager)) defaults.packageManager = value.packageManager as MarketplacePrefs['packageManager']
    if (value.afterInstall === 'restart' || value.afterInstall === 'ask') defaults.afterInstall = value.afterInstall
    if (value.skippedVersions && typeof value.skippedVersions === 'object' && !Array.isArray(value.skippedVersions)) {
      defaults.skippedVersions = Object.fromEntries(Object.entries(value.skippedVersions).filter(([, version]) => typeof version === 'string'))
    }
  }
  return defaults
}
