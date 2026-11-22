import type { MarketplacePrefs } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { OfficialSnapshot } from '../catalog/official-source.js'
import type { CatalogContext, CatalogOptions } from '../catalog/service.js'
import type { UpdateVersion } from './updates.js'
import { compatibility } from '../catalog/compat.js'
import { hasHostedSnapshot } from '../catalog/official-source.js'
import { registryReleases } from '../catalog/registry-entry.js'
import { getCatalogService } from '../catalog/service.js'
import { detectProjectSignals } from '../catalog/signals.js'
import { PlanningError } from '../changes/plan-store.js'

/** Resolve installed-plugin release history consistently for updates, notes and migrations. */
export async function readReleaseMetadata(ctx: CatalogContext, id: string, prefs: MarketplacePrefs, options: {
  /** Planner reads may neither fetch nor write cache files. */ readOnly?: boolean
  /** An update check can share its snapshot with all installed packages. */ snapshot?: OfficialSnapshot
  /** Local fixture control for registry and feed reads. */ catalog?: CatalogOptions
} = {}) {
  const service = getCatalogService(ctx, options.catalog)
  const snapshot = id.startsWith('@histoire/') ? options.snapshot ?? await service.officialSnapshot(options.readOnly) : undefined
  const official = snapshot?.listings.get(id)
  const hosted = snapshot !== undefined && hasHostedSnapshot(snapshot)
  if (official && (!prefs.community || hosted)) return { releases: official.releases, official: true, hosted }
  if (!prefs.community) return { releases: [], official: false, hosted: false }
  const result = options.readOnly ? await service.cachedPackument(id) : await service.packument(id)
  if (!result) throw new PlanningError('unavailable', 'Open plugin update details before reviewing migrations')
  return { releases: registryReleases(result.value), official: Boolean(official), hosted: false }
}

/** Evaluate exact releases against the running Histoire and installed peers. */
export async function compatibleUpdates(ctx: CatalogContext, { releases, hosted }: Awaited<ReturnType<typeof readReleaseMetadata>>): Promise<UpdateVersion[]> {
  const project = await detectProjectSignals(ctx, releases.flatMap(release => Object.keys(release.detail.requires)), hosted)
  return releases.map(({ version, detail, optionalPeers, deprecated }) => ({
    version,
    ...(deprecated ? { deprecated } : {}),
    compatible: compatibility(detail, project, optionalPeers).ok,
    releaseNotes: detail.releaseNotes,
  }))
}

/** Public reader for one plugin, sharing one catalog service for the generation. */
export async function readUpdateVersions(ctx: Context, id: string, prefs: MarketplacePrefs, options?: CatalogOptions): Promise<UpdateVersion[]> {
  return compatibleUpdates(ctx, await readReleaseMetadata(ctx, id, prefs, { catalog: options }))
}

/** Adapt release metadata and expose the same snapshot to inventory eligibility checks. */
export function createRegistryUpdateReader(ctx: Context, options?: CatalogOptions) {
  return Object.assign(
    /** Use inventory's captured snapshot when available. */
    async (id: string, prefs: MarketplacePrefs, snapshot?: OfficialSnapshot) => compatibleUpdates(ctx, await readReleaseMetadata(ctx, id, prefs, { snapshot, catalog: options })),
    { officialSnapshot: getCatalogService(ctx, options).officialSnapshot },
  )
}
