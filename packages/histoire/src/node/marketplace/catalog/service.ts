import type { CatalogEntry, CatalogPage, CatalogQuery, MarketplacePrefs, PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { OfficialContext, OfficialSourceOptions } from './official-source.js'
import type { RegistryRelease } from './registry-entry.js'
import type { RegistryOptions } from './registry.js'
import type { ProjectSignals } from './signals.js'
import { getInstalledIndex } from '../inventory/index.js'
import { compatibility } from './compat.js'
import { discoverCatalog } from './discover.js'
import { CatalogNotFoundError } from './errors.js'
import { catalogFacets, filterCatalog } from './facets.js'
import { createOfficialSource, hasHostedSnapshot } from './official-source.js'
import { fitCatalogPage } from './page-budget.js'
import { registryDetail, registryRelease } from './registry-entry.js'
import { createRegistryClient } from './registry.js'
import { searchCatalog } from './search.js'
import { detectProjectSignals } from './signals.js'
import { catalogQuerySchema, exactVersion, packageName, prefsSchema } from './validation.js'
import { isPrerelease } from './version.js'

/** Remove detail-only metadata from list replies to preserve channel capacity. */
function catalogEntry(detail: PluginDetail): CatalogEntry {
  const { manifest: _manifest, versions: _versions, provenance: _provenance, requires: _requires, access: _access, releaseNotes: _notes, ...entry } = detail
  return entry
}

/** Catalog reads need only a root; full contexts add generation-scoped installed state. */
export type CatalogContext = OfficialContext & Partial<Pick<Context, 'pluginInventory'>>
/** Independent public and consent-gated transport options. */
export type CatalogOptions = RegistryOptions & OfficialSourceOptions

/** Server-owned catalog with offline official fallback and consent-gated registry reads. */
export function createCatalogService(ctx: CatalogContext, options: CatalogOptions = {}) {
  // Resolve registry settings lazily: community-off must work even with a broken registry URL.
  let registry: ReturnType<typeof createRegistryClient> | undefined
  /** One cached registry client per project context/service. */
  const client = () => registry ??= createRegistryClient(ctx.root, options)
  const officialSnapshot = createOfficialSource(ctx, options)
  /** Apply project compatibility and inventory without mutating bundled or cached metadata. */
  function decorate(detail: PluginDetail, project: ProjectSignals, optionalPeers: string[] = []): PluginDetail {
    const installed = getInstalledIndex(ctx as Context).get(detail.id)
    const compatible = compatibility(detail, project, optionalPeers)
    return { ...detail, installed, compatible, versions: detail.versions.map(version => version.version === detail.latest
      ? { ...version, compatible: compatible.ok, ...(!compatible.ok ? { reason: compatible.reason } : {}) }
      : version) }
  }
  /** Compute a suggested first install from the approved versions on the listing's channel. */
  function withInstallVersion(output: PluginDetail, candidates: readonly RegistryRelease[], project: ProjectSignals): PluginDetail {
    if (output.installed || output.compatible.ok) return output
    const release = candidates.find(release => !release.deprecated
      && (isPrerelease(output.latest) || !isPrerelease(release.version))
      && compatibility(release.detail, project, release.optionalPeers).ok)
    return release ? { ...output, installVersion: release.version } : output
  }
  /** Read allowed sources concurrently. Curated identities win every collision. */
  async function entries(prefs: MarketplacePrefs) {
    const [official, community] = await Promise.all([
      officialSnapshot(),
      prefs.community ? readCommunity() : undefined,
    ])
    const merged = new Map([...official.listings].map(([id, record]) => [id, record.listing]))
    for (const pkg of community?.packuments ?? []) {
      if (merged.has(pkg.name)) continue
      const release = registryDetail(pkg)
      if (release) merged.set(pkg.name, release)
    }
    const peers = [...merged.values()].flatMap(release => Object.keys(release.detail.requires))
    if (hasHostedSnapshot(official)) {
      for (const { releases } of official.listings.values()) peers.push(...releases.flatMap(release => Object.keys(release.detail.requires)))
    }
    const project = await detectProjectSignals(ctx, peers, hasHostedSnapshot(official))
    return {
      entries: [...merged.values()].map((release) => {
        const output = decorate(release.detail, project, release.optionalPeers)
        const record = hasHostedSnapshot(official) ? official.listings.get(output.id) : undefined
        return record ? withInstallVersion(output, record.releases, project) : output
      }),
      community: community?.status ?? 'off' as const,
      official: official.source === 'bundled' ? 'ok' as const : official.source,
      project,
    }
  }
  /** Community failure never blocks official entries. */
  async function readCommunity() {
    try {
      const result = await client().catalog()
      return { status: result.stale ? 'stale' as const : 'ok' as const, packuments: result.packuments }
    }
    catch { return { status: 'error' as const } }
  }
  /** Filter and rank every source entry before pagination, including facet alternatives. */
  async function catalog(input: CatalogQuery): Promise<CatalogPage> {
    const query = catalogQuerySchema.parse(input) as CatalogQuery
    const result = await entries(query.prefs)
    const { project } = result
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
      facets: catalogFacets(ranked, query.filters, project.project.frameworks),
      project: project.project,
      sources: { official: result.official, community: result.community },
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
    return fitCatalogPage(page, offset)
  }
  /** Exact details require explicit consent unless the identity is curated. */
  async function detail(id: string, prefs: MarketplacePrefs, version?: string): Promise<PluginDetail> {
    packageName.parse(id)
    prefsSchema.parse(prefs)
    if (version !== undefined) exactVersion.parse(version)
    const snapshot = await officialSnapshot()
    const official = snapshot.listings.get(id)
    if (official) {
      const hosted = hasHostedSnapshot(snapshot)
      const release = hosted && version ? official.releases.find(release => release.version === version) : official.listing
      if (!release) throw new CatalogNotFoundError()
      const project = await detectProjectSignals(ctx, [release, ...official.releases].flatMap(release => Object.keys(release.detail.requires)), hosted)
      const output = decorate(release.detail, project, release.optionalPeers)
      if (official.releases.length) output.versions = official.releases.map(item => versionRow(item, project, hosted))
      return hosted && !version ? withInstallVersion(output, official.releases, project) : output
    }
    if (!prefs.community) throw new CatalogNotFoundError()
    const { value: pkg } = await client().packument(id)
    const latest = registryDetail(pkg)
    const release = version ? registryRelease(pkg, version) : latest
    if (!release || !latest) throw new CatalogNotFoundError()
    const versions = latest.detail.versions.map(row => ({ row, release: registryRelease(pkg, row.version) }))
    const project = await detectProjectSignals(ctx, [
      ...Object.keys(release.detail.requires),
      ...versions.flatMap(item => Object.keys(item.release?.detail.requires ?? {})),
    ])
    const output = decorate(release.detail, project, release.optionalPeers)
    output.versions = versions.map(({ row, release }) => {
      const verdict = release ? compatibility(release.detail, project, release.optionalPeers) : { ok: false, reason: 'Marketplace metadata unavailable' }
      return { ...row, compatible: verdict.ok, ...(!verdict.ok ? { reason: verdict.reason } : {}) }
    })
    return output
  }
  /** Keep version-specific eligibility and publication metadata on the wire. */
  function versionRow(release: RegistryRelease, project: ProjectSignals, hosted: boolean): PluginDetail['versions'][number] {
    const verdict = hosted && release.deprecated
      ? { ok: false, reason: 'Version is deprecated' }
      : compatibility(release.detail, project, release.optionalPeers)
    return {
      version: release.version,
      compatible: verdict.ok,
      ...(release.detail.updatedAt ? { date: release.detail.updatedAt } : {}),
      ...(hosted ? { deprecated: release.deprecated } : {}),
      ...(!verdict.ok ? { reason: verdict.reason } : {}),
    }
  }
  return {
    catalog,
    detail,
    officialSnapshot,
    /** Exact metadata fetch shared by update checks, migrations and failure advice. */
    packument: (id: string) => client().packument(id),
    /** Read-only planning lookup through the same registry configuration and identity guards. */
    cachedPackument: (id: string) => client().cachedPackument(id),
  }
}

/** Context lifetime owns registry cache/in-flight sharing across transport consumers. */
const services = new WeakMap<CatalogContext, ReturnType<typeof createCatalogService>>()
/** Shared catalog export for inventory, planning and jobs. */
export function getCatalogService(ctx: CatalogContext, options: CatalogOptions = {}) {
  let service = services.get(ctx)
  if (!service) {
    service = createCatalogService(ctx, options)
    services.set(ctx, service)
  }
  return service
}
