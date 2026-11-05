import type { MarketplacePrefs } from '@histoire/shared'
import type { RegistryPackument } from '../catalog/registry-entry.js'
import type { CatalogContext } from '../catalog/service.js'
import { officialReleases } from '../catalog/official.js'
import { registryReleases } from '../catalog/registry-entry.js'
import { getCatalogService } from '../catalog/service.js'
import { PlanningError } from '../changes/planner.js'
import { exactVersion } from '../changes/validation.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'

/** A packument's immutable release details are shared by migration reads. */
const histories = new WeakMap<RegistryPackument, ReturnType<typeof officialReleases>>()

/** Read actual installed bytes; dependency ranges and generation snapshots are insufficient. */
export async function installedVersion(root: string, id: string): Promise<string> {
  const pkg = await readInstalledPackage(root, id)
  if (!exactVersion.safeParse(pkg.version).success) throw new PlanningError('unavailable', 'Installed plugin version is unavailable')
  return pkg.version
}

/** Read validated release history; planning consumes cache only and never writes or fetches. */
export async function readReleases(context: CatalogContext | string, id: string, prefs: MarketplacePrefs, readOnly = false) {
  if (!prefs.community) return officialReleases(id)
  const ctx = typeof context === 'string' ? { root: context } : context
  const service = getCatalogService(ctx)
  const result = readOnly
    ? await service.cachedPackument(id)
    : await service.packument(id)
  if (!result) throw new PlanningError('unavailable', 'Open plugin update details before reviewing migrations')
  const pkg = result.value
  let history = histories.get(pkg)
  if (!history) {
    history = registryReleases(pkg).map(release => release.detail)
    histories.set(pkg, history)
  }
  return history
}
