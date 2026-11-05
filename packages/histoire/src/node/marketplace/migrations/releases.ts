import type { MarketplacePrefs } from '@histoire/shared'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { findProjectPackageDirectories } from '../../util/resolve-package.js'
import { createRegistryCache } from '../catalog/cache.js'
import { registryPackumentUrl, resolveNpmConfig } from '../catalog/npm-config.js'
import { officialReleases } from '../catalog/official.js'
import { packumentSchema, registryRelease } from '../catalog/registry-entry.js'
import { createRegistryClient } from '../catalog/registry.js'
import { PlanningError } from '../changes/planner.js'
import { exactVersion } from '../changes/validation.js'

/** Read actual installed bytes; dependency ranges and generation snapshots are insufficient. */
export async function installedVersion(root: string, id: string): Promise<string> {
  const directory = findProjectPackageDirectories(root, id)[0]
  if (!directory) throw new PlanningError('unavailable', 'Installed plugin version is unavailable')
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  if (pkg.name !== id || !exactVersion.safeParse(pkg.version).success) throw new PlanningError('unavailable', 'Installed plugin version is unavailable')
  return pkg.version
}

/** Read validated release history; planning consumes cache only and never writes or fetches. */
export async function readReleases(root: string, id: string, prefs: MarketplacePrefs, readOnly = false) {
  if (!prefs.community) return officialReleases(id)
  const result = readOnly
    ? await createRegistryCache(root).read(registryPackumentUrl(await resolveNpmConfig(root), id), value => packumentSchema.parse(value))
    : await createRegistryClient(root).packument(id)
  if (!result) throw new PlanningError('unavailable', 'Open plugin update details before reviewing migrations')
  const pkg = result.value
  if (pkg.name !== id) throw new PlanningError('invalid', 'Invalid registry package identity')
  return Object.keys(pkg.versions).flatMap((version) => {
    const release = registryRelease(pkg, version)
    return release ? [release.detail] : []
  })
}
