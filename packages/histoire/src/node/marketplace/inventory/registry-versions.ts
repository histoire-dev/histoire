import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { RegistryOptions } from '../catalog/registry.js'
import type { ReadUpdateVersions, UpdateVersion } from './updates.js'
import { compatibility } from '../catalog/compat.js'
import { officialReleases } from '../catalog/official.js'
import { registryReleases } from '../catalog/registry-entry.js'
import { getCatalogService } from '../catalog/service.js'
import { detectProjectSignals } from '../catalog/signals.js'

/** Read every version against one generation's project evidence and shared registry client. */
export async function readUpdateVersions(ctx: Context, id: string, prefs: MarketplacePrefs, options?: RegistryOptions): Promise<UpdateVersion[]> {
  const releases = prefs.community
    ? registryReleases((await getCatalogService(ctx, options).packument(id)).value)
    : officialReleases(id).map(detail => ({ version: detail.latest, detail, optionalPeers: [], deprecated: false }))
  const project = await detectProjectSignals(ctx, releases.flatMap(release => Object.keys(release.detail.requires)))
  return releases.map(({ version, detail, optionalPeers, deprecated }) => ({
    version,
    ...(prefs.community ? { deprecated } : {}),
    compatible: compatibility(detail, project, optionalPeers).ok,
    releaseNotes: detail.releaseNotes,
  }))
}

/** Transport adapter; every reader for this context uses the catalog-owned client. */
export function createRegistryUpdateReader(ctx: Context, options?: RegistryOptions): ReadUpdateVersions {
  return (id, prefs) => readUpdateVersions(ctx, id, prefs, options)
}
