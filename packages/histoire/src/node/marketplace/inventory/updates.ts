import type { MarketplacePrefs, MarketplaceUpdate, ReleaseNote } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { OfficialSnapshot } from '../catalog/official-source.js'
import { hasHostedSnapshot } from '../catalog/official-source.js'
import { compareVersions, isPrerelease, majorVersion } from '../catalog/version.js'
import { getInstalledIndex } from './index.js'

/** Plain registry version data after catalog compatibility checks. */
export interface UpdateVersion {
  /** Exact published version. */ version: string
  /** Compatible with project Histoire, framework and peer versions. */ compatible: boolean
  /** Deprecated versions cannot be offered. */ deprecated?: boolean
  /** This version's declarative notes. */ releaseNotes?: ReleaseNote[]
}

/** Catalog-owned external registry boundary, injectable for transport tests. */
export interface ReadUpdateVersions {
  (id: string, prefs: MarketplacePrefs, snapshot?: OfficialSnapshot): Promise<readonly UpdateVersion[]>
  /** Production catalog resolves official identity at read time. */
  officialSnapshot?: (readOnly?: boolean) => Promise<OfficialSnapshot>
}

/** Pick a newer compatible release; stable installs never drift onto prerelease channels. */
export function selectUpdate(id: string, from: string, versions: readonly UpdateVersion[], prefs: MarketplacePrefs): MarketplaceUpdate | undefined {
  const target = versions.filter(item => item.compatible && !item.deprecated && prefs.skippedVersions[id] !== item.version
    && compareVersions(item.version, from) > 0
    && (isPrerelease(from) || !isPrerelease(item.version)))
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  if (!target) return
  return {
    id,
    from,
    to: target.version,
    breaking: majorVersion(target.version) > majorVersion(from)
      || Boolean(target.releaseNotes?.some(note => note.kind === 'breaking')),
  }
}

/** Cache registry results for one hour per generation/source policy; reapply dismissals each read. */
export function createUpdateService(ctx: Context, readVersions: ReadUpdateVersions, now: () => number = Date.now) {
  const cache = new Map<string, { /** Cache deadline. */ expires: number, /** Coalesced registry work. */ versions: Promise<readonly UpdateVersion[]> }>()
  return {
    /** Return all eligible updates without changing installed package versions. */
    async updates(prefs: MarketplacePrefs): Promise<MarketplaceUpdate[]> {
      const installed = getInstalledIndex(ctx)
      const hasScopedPackage = [...installed].some(([id, state]) => id.startsWith('@histoire/') && state && state.version !== 'local')
      const snapshot = hasScopedPackage ? await readVersions.officialSnapshot?.() : undefined
      const results = await Promise.all([...installed].map(async ([id, state]) => {
        if (!state || state.version === 'local') return
        const row = ctx.pluginInventory?.find(row => row.packageName === id)
        const official = snapshot ? snapshot.listings.has(id) : row?.official
        if (!row || row.local || (!prefs.community && !official)) {
          delete state.update
          return
        }
        const installedState = state
        /** Retain the selected version for catalog installed rows. */
        function publish(versions: readonly UpdateVersion[]) {
          const update = selectUpdate(id, installedState.version, versions, prefs)
          if (update) installedState.update = update.to
          else delete installedState.update
          return update
        }
        // The feed already caches releases. A second TTL would hide a published refresh.
        if (official && snapshot && hasHostedSnapshot(snapshot)) {
          return publish(await readVersions(id, prefs, snapshot))
        }
        const key = JSON.stringify([id, prefs.community, snapshot?.source])
        let entry = cache.get(key)
        if (!entry || entry.expires <= now()) {
          const versions = Promise.resolve().then(() => readVersions(id, prefs, snapshot))
          entry = { expires: now() + 3_600_000, versions }
          cache.set(key, entry)
          // Failed reads must be retryable; an older rejection must not evict a successor.
          void versions.catch(() => {
            if (cache.get(key)?.versions === versions) cache.delete(key)
          })
        }
        return publish(await entry.versions)
      }))
      return results.filter((update): update is MarketplaceUpdate => Boolean(update))
    },
  }
}
