import type { CatalogEntry, CatalogPage, CatalogQuery, MarketplacePrefs, PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { RegistryOptions } from './registry.js'
import type { ProjectSignals } from './signals.js'
import { createRequire } from 'node:module'
import { getInstalledIndex } from '../inventory/index.js'
import { compatibility } from './compat.js'
import { discoverCatalog } from './discover.js'
import { CatalogNotFoundError } from './errors.js'
import { catalogFacets, filterCatalog } from './facets.js'
import { officialPlugins, officialReleases } from './official.js'
import { registryDetail, registryRelease } from './registry-entry.js'
import { createRegistryClient } from './registry.js'
import { searchCatalog } from './search.js'
import { detectProjectSignals } from './signals.js'
import { catalogQuerySchema, packageName, prefsSchema } from './validation.js'

/** Running Histoire package version, independent of the project's dependency range. */
const histoireVersion: string = createRequire(import.meta.url)('../../../../package.json').version

/** Remove detail-only metadata from list replies to preserve channel capacity. */
function catalogEntry(detail: PluginDetail): CatalogEntry {
  const { manifest: _manifest, versions: _versions, provenance: _provenance, requires: _requires, access: _access, releaseNotes: _notes, ...entry } = detail
  return entry
}

/** Catalog reads need only a root; full contexts add generation-scoped installed state. */
export type CatalogContext = Pick<Context, 'root'> & Partial<Pick<Context, 'pluginInventory'>>

/** Server-owned catalog with offline official fallback and consent-gated registry reads. */
export function createCatalogService(ctx: CatalogContext, options: RegistryOptions = {}) {
  // Resolve registry settings lazily: community-off must work even with a broken registry URL.
  let registry: ReturnType<typeof createRegistryClient> | undefined
  /** One cached registry client per project context/service. */
  const client = () => registry ??= createRegistryClient(ctx.root, options)
  /** Apply project compatibility and inventory without mutating bundled or cached metadata. */
  function decorate(detail: PluginDetail, project: ProjectSignals, optionalPeers: string[] = []): PluginDetail {
    const installed = getInstalledIndex(ctx as Context).get(detail.id)
    const requires = Object.fromEntries(Object.entries(detail.requires).filter(([name]) => !optionalPeers.includes(name) || project.versions[name]))
    const compatible = compatibility(requires, detail.frameworks, project, histoireVersion)
    return { ...detail, installed, compatible, versions: detail.versions.map(version => version.version === detail.latest
      ? { ...version, compatible: compatible.ok, ...(!compatible.ok ? { reason: compatible.reason } : {}) }
      : version) }
  }
  /** Read all allowed sources; official index wins every collision. */
  async function entries(prefs: MarketplacePrefs, project: ProjectSignals) {
    const merged = new Map(officialPlugins.map(detail => [detail.id, decorate(detail, project)]))
    let community: CatalogPage['sources']['community'] = 'off'
    if (prefs.community) {
      try {
        const result = await client().catalog()
        community = result.stale ? 'stale' : 'ok'
        for (const pkg of result.packuments) {
          if (merged.has(pkg.name)) continue
          const release = registryDetail(pkg)
          if (release) merged.set(pkg.name, decorate(release.detail, project, release.optionalPeers))
        }
      }
      catch { community = 'error' }
    }
    return { entries: [...merged.values()], community }
  }
  /** Filter and rank every source entry before pagination, including facet alternatives. */
  async function catalog(input: CatalogQuery): Promise<CatalogPage> {
    const query = catalogQuerySchema.parse(input) as CatalogQuery
    const project = await detectProjectSignals(ctx.root)
    const result = await entries(query.prefs, project)
    // Collection membership narrows every facet alternative as well as paged rows.
    const collection = query.filters?.collection
    const members = collection ? result.entries.filter(entry => entry.manifest.collections?.includes(collection)) : result.entries
    const ranked = searchCatalog(members, query.query)
    const filtered = filterCatalog(ranked, query.filters)
    if (query.sort === 'name') filtered.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
    if (query.sort === 'updated') filtered.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id))
    const offset = Number(query.cursor ?? 0)
    const limit = query.limit ?? 30
    const page: CatalogPage = {
      entries: filtered.slice(offset, offset + limit).map(catalogEntry),
      total: filtered.length,
      cursor: offset + limit < filtered.length ? String(offset + limit) : undefined,
      facets: catalogFacets(ranked, query.filters, project.frameworks),
      project: project.project,
      sources: { official: 'ok', community: result.community },
    }
    if (query.view === 'discover') {
      const installedCategories = new Set(result.entries.filter(entry => entry.installed).map(entry => entry.category))
      const discover = discoverCatalog(filtered, project, installedCategories)
      page.discover = {
        hero: discover.hero ? { ...catalogEntry(discover.hero), reason: discover.hero.reason } : undefined,
        picks: discover.picks.map(entry => ({ ...catalogEntry(entry), reason: entry.reason })),
        collections: discover.collections.map(collection => ({ ...collection, entries: collection.entries.slice(0, 12).map(catalogEntry) })),
      }
    }
    return page
  }
  /** Exact details require explicit community consent unless identity is bundled. */
  async function detail(id: string, prefs: MarketplacePrefs): Promise<PluginDetail> {
    packageName.parse(id)
    prefsSchema.parse(prefs)
    const project = await detectProjectSignals(ctx.root)
    const official = officialPlugins.find(entry => entry.id === id)
    if (official) {
      const output = decorate(structuredClone(official), project)
      // Bundled history carries each version's own requirements, so older rows get real verdicts.
      const releases = officialReleases(id)
      if (releases.length) {
        output.versions = releases.map((release) => {
          const verdict = decorate(release, project).compatible
          return { version: release.latest, compatible: verdict.ok, ...(release.updatedAt ? { date: release.updatedAt } : {}), ...(!verdict.ok ? { reason: verdict.reason } : {}) }
        })
      }
      return output
    }
    if (!prefs.community) throw new CatalogNotFoundError()
    const { value: pkg } = await client().packument(id)
    const release = registryDetail(pkg)
    if (!release) throw new CatalogNotFoundError()
    const output = decorate(release.detail, project, release.optionalPeers)
    output.versions = output.versions.map((version) => {
      const entry = registryRelease(pkg, version.version)
      const verdict = entry ? decorate(entry.detail, project, entry.optionalPeers).compatible : { ok: false, reason: 'Marketplace metadata unavailable' }
      return { ...version, compatible: verdict.ok, ...(!verdict.ok ? { reason: verdict.reason } : {}) }
    })
    return output
  }
  return { catalog, detail }
}

/** Context lifetime owns registry cache/in-flight sharing across transport consumers. */
const services = new WeakMap<CatalogContext, ReturnType<typeof createCatalogService>>()
/** Shared catalog export for inventory, planning and jobs. */
export function getCatalogService(ctx: CatalogContext) {
  let service = services.get(ctx)
  if (!service) {
    service = createCatalogService(ctx)
    services.set(ctx, service)
  }
  return service
}
