import type { ChangeRequest } from '@histoire/shared'
import type { CatalogContext } from '../catalog/service.js'
import type { PlannerOptions, PlanningPlugin } from './planner.js'
import { compatibility } from '../catalog/compat.js'
import { hasHostedSnapshot } from '../catalog/official-source.js'
import { registryRelease } from '../catalog/registry-entry.js'
import { getCatalogService } from '../catalog/service.js'
import { detectProjectSignals } from '../catalog/signals.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { validateMarketplaceManifest } from '../manifest/index.js'
import { PlanningError } from './planner.js'

/** Resolves bundled, installed or cached metadata without executing code or writing caches. */
export function projectPluginResolver(context: CatalogContext | string, registryUrl?: string): PlannerOptions['resolvePlugin'] {
  return async (request: ChangeRequest): Promise<PlanningPlugin> => {
    const ctx = typeof context === 'string' ? { root: context } : context
    // Options/removal use the installed schema, not a potentially newer release.
    const pkg = await readInstalledPackage(ctx.root, request.id)
    const { manifest } = validateMarketplaceManifest(pkg.histoire?.marketplace)
    if (manifest && typeof pkg.version === 'string' && (request.kind === 'remove' || request.kind === 'options' || request.version === pkg.version)) return { manifest, version: pkg.version }
    const service = getCatalogService(ctx, { registryUrl })
    if (request.id.startsWith('@histoire/')) {
      const snapshot = await service.officialSnapshot(true)
      const record = snapshot.listings.get(request.id)
      if (record) {
        const release = request.version && hasHostedSnapshot(snapshot)
          ? record.releases.find(item => item.version === request.version)
          : record.listing
        if (release && (!request.version || request.version === release.version)) {
          if (hasHostedSnapshot(snapshot) && (request.kind === 'install' || request.kind === 'update')) {
            const project = await detectProjectSignals(ctx, Object.keys(release.detail.requires), true)
            const verdict = compatibility(release.detail, project, release.optionalPeers)
            if (!verdict.ok || release.deprecated) throw new PlanningError('unavailable', verdict.reason ?? 'Plugin version is deprecated')
          }
          return { manifest: release.detail.manifest, version: release.version }
        }
        if (hasHostedSnapshot(snapshot)) throw new PlanningError('unavailable', 'Target plugin metadata is unavailable. Open plugin details again')
      }
    }
    if (request.prefs.community) {
      // Detail metadata survives denied disk persistence within this generation.
      // Explicit read-only lookup cannot refresh or write cache files.
      try {
        const cached = await service.cachedPackument(request.id)
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
