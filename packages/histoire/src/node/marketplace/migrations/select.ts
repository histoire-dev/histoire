import type { MarketplaceManifest, MigrationOp } from '@histoire/shared'
import { compareVersions, satisfiesVersion } from '../catalog/version.js'

/** Validated release metadata, ordered explicitly before migration selection. */
interface MigrationRelease {
  /** Exact package version. */ version: string
  /** Declarative version manifest. */ manifest: MarketplaceManifest
}
/** Select ordered migrations for an installed-to-target update. */
export function selectMigrations(releases: readonly MigrationRelease[], from: string, to: string): MigrationOp[] {
  if (compareVersions(to, from) <= 0) return []
  return releases.filter(release => compareVersions(release.version, from) > 0 && compareVersions(release.version, to) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .flatMap(release => (release.manifest.migrations ?? []).filter(migration => satisfiesVersion(from, migration.from)).flatMap(migration => migration.ops))
}
