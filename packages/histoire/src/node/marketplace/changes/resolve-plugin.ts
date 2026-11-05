import type { ChangeRequest } from '@histoire/shared'
import type { CatalogContext } from '../catalog/service.js'
import type { PlannerOptions, PlanningPlugin } from './planner.js'
import { officialPlugins } from '../catalog/official.js'
import { registryRelease } from '../catalog/registry-entry.js'
import { getCatalogService } from '../catalog/service.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { validateMarketplaceManifest } from '../manifest/index.js'
import { PlanningError } from './planner.js'

/** Resolves bundled, installed or cached metadata without executing code or writing caches. */
export function projectPluginResolver(context: CatalogContext | string, registryUrl?: string): PlannerOptions['resolvePlugin'] {
  return async (request: ChangeRequest): Promise<PlanningPlugin> => {
    const ctx = typeof context === 'string' ? { root: context } : context
    const bundled = officialPlugins.find(entry => entry.id === request.id)
    // Options/removal use the installed schema, not a potentially newer release.
    const pkg = await readInstalledPackage(ctx.root, request.id)
    const { manifest } = validateMarketplaceManifest(pkg.histoire?.marketplace)
    if (manifest && typeof pkg.version === 'string' && (request.kind === 'remove' || request.kind === 'options' || request.version === pkg.version)) return { manifest, version: pkg.version }
    if (bundled && (!request.version || request.version === bundled.latest)) return { manifest: bundled.manifest, version: bundled.latest }
    if (request.prefs.community) {
      // Detail metadata survives denied disk persistence within this generation.
      // Explicit read-only lookup cannot refresh or write cache files.
      try {
        const cached = await getCatalogService(ctx, { registryUrl }).cachedPackument(request.id)
        if (!cached) throw new Error('Missing cached package metadata')
        const version = request.version ?? cached.value['dist-tags'].latest
        const release = registryRelease(cached.value, version)
        if (release) return { manifest: release.detail.manifest, version }
      }
      catch { /* Missing or invalid metadata requires reopening plugin details. */ }
    }
    throw new PlanningError('unavailable', 'Target plugin metadata is unavailable. Open plugin details again')
  }
}
