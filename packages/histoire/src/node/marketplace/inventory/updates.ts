import type { MarketplacePrefs, MarketplaceUpdate, ReleaseNote } from '@histoire/shared'
import type { Context } from '../../context.js'
import { compareVersions } from '../catalog/version.js'
import { getInstalledIndex } from './index.js'

/** Plain registry version data after catalog compatibility checks. */
export interface UpdateVersion {
  /** Exact published version. */ version: string
  /** Compatible with project Histoire, framework and peer versions. */ compatible: boolean
  /** Deprecated versions cannot be offered. */ deprecated?: boolean
  /** This version's declarative notes. */ releaseNotes?: ReleaseNote[]
}

/** Catalog-owned external registry boundary, injectable for transport tests. */
export type ReadUpdateVersions = (id: string, prefs: MarketplacePrefs) => Promise<readonly UpdateVersion[]>

/** Pick a newer compatible release; stable installs never drift onto prerelease channels. */
export function selectUpdate(id: string, from: string, versions: readonly UpdateVersion[], prefs: MarketplacePrefs): MarketplaceUpdate | undefined {
  const target = versions.filter(item => item.compatible && !item.deprecated && prefs.skippedVersions[id] !== item.version
    && (from.split('+')[0].includes('-') || !item.version.split('+')[0].includes('-'))
    && compareVersions(item.version, from) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0]
  if (!target) return
  return {
    id,
    from,
    to: target.version,
    breaking: Number(target.version.replace(/^v/, '').split('.')[0]) > Number(from.replace(/^v/, '').split('.')[0])
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
      const results = await Promise.all([...installed].map(async ([id, state]) => {
        if (!state || state.version === 'local') return
        const row = ctx.pluginInventory?.find(row => row.packageName === id)
        if (!row || row.local || (!prefs.community && !row.official)) {
          delete state.update
          return
        }
        const key = JSON.stringify([id, prefs.community])
        let entry = cache.get(key)
        if (!entry || entry.expires <= now()) {
          const versions = Promise.resolve().then(() => readVersions(id, prefs))
          entry = { expires: now() + 3_600_000, versions }
          cache.set(key, entry)
          // Failed reads must be retryable; an older rejection must not evict a successor.
          void versions.catch(() => {
            if (cache.get(key)?.versions === versions) cache.delete(key)
          })
        }
        const update = selectUpdate(id, state.version, await entry.versions, prefs)
        if (update) state.update = update.to
        else delete state.update
        return update
      }))
      return results.filter((update): update is MarketplaceUpdate => Boolean(update))
    },
  }
}
