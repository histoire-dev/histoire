import type { MarketplaceManifest, PluginDetail } from '@histoire/shared'
import index from './official.json' with { type: 'json' }

/** Node-only version metadata; never transported as part of a detail DTO. */
interface OfficialHistoryEntry {
  /** Exact published version. */ version: string
  /** Release-specific peer requirements. */ requires: Record<string, string>
  /** Release-specific supported frameworks. */ frameworks: string[]
  /** Notes authored for this version only. */ releaseNotes?: MarketplaceManifest['releaseNotes']
  /** Declarative migrations introduced by this version. */ migrations?: MarketplaceManifest['migrations']
  /** Optional publication timestamp. */ publishedAt?: string
}

/** Bundled identity is authoritative; registry claims cannot promote publishers. */
export const officialPlugins: PluginDetail[] = index.map(({ history: _history, ...entry }) => ({
  ...entry as PluginDetail,
  official: entry.id.startsWith('@histoire/'),
  compatible: { ok: true },
  installed: undefined,
}))

/** Overlay version fields without leaking newer release notes, migrations or requirements backwards. */
export function officialReleases(id: string): PluginDetail[] {
  const current = officialPlugins.find(entry => entry.id === id && entry.official)
  const bundled = index.find(entry => entry.id === id)
  if (!current || !bundled) return []
  const history: OfficialHistoryEntry[] = bundled.history
  return history.map(release => structuredClone({
    ...current,
    latest: release.version,
    updatedAt: release.publishedAt,
    requires: release.requires,
    frameworks: release.frameworks,
    releaseNotes: release.releaseNotes,
    manifest: {
      ...current.manifest,
      requires: release.requires,
      frameworks: release.frameworks,
      releaseNotes: release.releaseNotes,
      migrations: release.migrations,
    },
  }))
}
