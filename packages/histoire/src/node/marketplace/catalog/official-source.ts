import type { PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { OfficialListing } from './official-feed.js'
import { createRegistryCache } from './cache.js'
import { fetchMarketplaceJson } from './fetch-json.js'
import { OFFICIAL_FEED_BYTES, OFFICIAL_FEED_URL, officialFeedListings, parseOfficialFeed } from './official-feed.js'
import { officialPlugins, officialReleases } from './official.js'

/** Source options for tests. Project configuration only controls whether refresh runs. */
export interface OfficialSourceOptions {
  /** Override the public endpoint in boundary tests. */ officialUrl?: string
  /** Limit the fetch deadline in boundary tests. */ officialTimeoutMs?: number
  /** Clock used for refresh and retry deadlines. */ now?: () => number
}

/** Context evidence needed to apply project refresh policy. */
export type OfficialContext = Pick<Context, 'root'> & Partial<Pick<Context, 'mode'>> & {
  /** Server-owned settings. */ config?: Pick<Context['config'], 'marketplace'>
}

/** A single consistent catalog used for a read or review. */
export interface OfficialSnapshot {
  /** Source freshness. */ source: 'bundled' | 'ok' | 'stale' | 'fallback'
  /** Identifies packages curated by this source. */ listings: ReadonlyMap<string, OfficialListing>
}

/** Lift the bundled history into the same shape as the live source. */
const bundled: OfficialSnapshot = {
  source: 'bundled',
  listings: new Map(officialPlugins.filter(entry => entry.official).map((entry) => {
    /** Bundled entries predate published peer metadata. */
    const release = (detail: PluginDetail) => ({ detail, version: detail.latest, optionalPeers: [], deprecated: false })
    return [entry.id, { listing: release(entry), releases: officialReleases(entry.id).map(release) }]
  })),
}

/** Share and persist validated public metadata without consulting npm configuration. */
export function createOfficialSource(ctx: OfficialContext, options: OfficialSourceOptions) {
  if (ctx.mode !== 'dev' || ctx.config?.marketplace?.refreshOfficialCatalog === false) {
    return async () => bundled
  }
  const url = options.officialUrl ?? OFFICIAL_FEED_URL
  const now = options.now ?? Date.now
  const cache = createRegistryCache(ctx.root, now, 'node_modules/.cache/histoire/marketplace/official')
  let nextRetry = 0
  let pending: Promise<OfficialSnapshot> | undefined

  /** Read, or refresh once per cache window. Planning never touches the network or writes files. */
  return async function officialSnapshot(readOnly = false): Promise<OfficialSnapshot> {
    if (readOnly || now() < nextRetry) {
      const saved = await cache.read(url, parseOfficialFeed)
      return saved
        ? { source: saved.stale ? 'stale' : 'ok', listings: officialFeedListings(saved.value) }
        : { ...bundled, source: 'fallback' }
    }
    pending ??= cache.get(url, parseOfficialFeed, () => fetchMarketplaceJson(url, OFFICIAL_FEED_BYTES, AbortSignal.timeout(options.officialTimeoutMs ?? 2000), undefined, 'Official catalog'))
      .then((result): OfficialSnapshot => {
        if (result.stale) nextRetry = now() + 300_000
        return { source: result.stale ? 'stale' : 'ok', listings: officialFeedListings(result.value) }
      })
      .catch((): OfficialSnapshot => {
        nextRetry = now() + 300_000
        return { ...bundled, source: 'fallback' }
      })
      .finally(() => { pending = undefined })
    return pending
  }
}

/** Whether exact hosted releases are authoritative for this request. */
export function hasHostedSnapshot(snapshot: OfficialSnapshot): boolean {
  return snapshot.source === 'ok' || snapshot.source === 'stale'
}
