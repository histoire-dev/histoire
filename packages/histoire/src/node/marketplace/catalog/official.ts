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

/** Version projections are built once; consumers only override their own outer DTOs. */
const releasesById = new Map(officialPlugins.filter(entry => entry.official).map((current) => {
  const bundled = index.find(entry => entry.id === current.id)!
  const history: OfficialHistoryEntry[] = bundled.history
  return [current.id, history.map(release => ({
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
  }))]
}))

/** Overlay release fields without leaking newer notes, migrations or requirements backwards. */
export function officialReleases(id: string): PluginDetail[] {
  // A fresh list lets callers sort history without changing its shared ordering.
  return (releasesById.get(id) ?? []).map(release => ({ ...release, requires: { ...release.requires }, manifest: { ...release.manifest, requires: { ...release.manifest.requires } } }))
}
