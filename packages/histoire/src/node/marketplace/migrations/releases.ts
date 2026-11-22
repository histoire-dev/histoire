import type { MarketplacePrefs } from '@histoire/shared'
import type { CatalogContext } from '../catalog/service.js'
import { PlanningError } from '../changes/planner.js'
import { exactVersion } from '../changes/validation.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { readReleaseMetadata } from '../inventory/registry-versions.js'

/** Read actual installed bytes; dependency ranges and generation snapshots are insufficient. */
export async function installedVersion(root: string, id: string): Promise<string> {
  const pkg = await readInstalledPackage(root, id)
  if (!exactVersion.safeParse(pkg.version).success) throw new PlanningError('unavailable', 'Installed plugin version is unavailable')
  return pkg.version
}

/** Read validated release history; planning consumes cache only and never writes or fetches. */
export async function readReleases(context: CatalogContext | string, id: string, prefs: MarketplacePrefs, readOnly = false) {
  const ctx = typeof context === 'string' ? { root: context } : context
  const history = await readReleaseMetadata(ctx, id, prefs, { readOnly })
  return history.releases.map(release => release.detail)
}
