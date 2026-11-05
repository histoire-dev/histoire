import type { ChangeRequest } from '@histoire/shared'
import type { PlannerOptions, PlanningPlugin } from './planner.js'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { findProjectPackageDirectories } from '../../util/resolve-package.js'
import { createRegistryCache } from '../catalog/cache.js'
import { registryPackumentUrl, resolveNpmConfig } from '../catalog/npm-config.js'
import { officialPlugins } from '../catalog/official.js'
import { packumentSchema, registryRelease } from '../catalog/registry-entry.js'
import { validateMarketplaceManifest } from '../manifest/index.js'
import { PlanningError } from './planner.js'

/** Resolves bundled, installed or cached metadata without executing code or writing caches. */
export function projectPluginResolver(root: string, registryUrl?: string): PlannerOptions['resolvePlugin'] {
  return async (request: ChangeRequest): Promise<PlanningPlugin> => {
    const bundled = officialPlugins.find(entry => entry.id === request.id)
    // Options/removal use the installed schema, not a potentially newer release.
    for (const directory of findProjectPackageDirectories(root, request.id).slice(0, 1)) {
      try {
        const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
        const { manifest } = validateMarketplaceManifest(pkg.histoire?.marketplace)
        if (pkg.name === request.id && manifest && typeof pkg.version === 'string' && (request.kind === 'remove' || request.kind === 'options' || request.version === pkg.version)) return { manifest, version: pkg.version }
      }
      catch { /* Bundled metadata remains available when installed JSON is absent. */ }
    }
    if (bundled && (!request.version || request.version === bundled.latest)) return { manifest: bundled.manifest, version: bundled.latest }
    if (request.prefs.community) {
      // Detail metadata survives denied disk persistence within this generation.
      // Explicit read-only lookup cannot refresh or write cache files.
      try {
        const key = registryPackumentUrl(await resolveNpmConfig(root, registryUrl), request.id)
        const cached = await createRegistryCache(root).read(key, value => packumentSchema.parse(value))
        if (!cached || cached.value.name !== request.id) throw new Error('Missing or invalid cached package identity')
        const version = request.version ?? cached.value['dist-tags'].latest
        const release = registryRelease(cached.value, version)
        if (release) return { manifest: release.detail.manifest, version }
      }
      catch { /* Missing or invalid metadata requires reopening plugin details. */ }
    }
    throw new PlanningError('unavailable', 'Target plugin metadata is unavailable. Open plugin details again')
  }
}
