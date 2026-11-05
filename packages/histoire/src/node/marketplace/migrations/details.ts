import type { MarketplacePrefs, PluginDetail } from '@histoire/shared'
import type { Context } from '../../context.js'
import { officialPlugins } from '../catalog/official.js'
import { compareVersions } from '../catalog/version.js'
import { PlanningError } from '../changes/planner.js'
import { readUpdateVersions } from '../inventory/registry-versions.js'
import { selectUpdate } from '../inventory/updates.js'
import { installedVersion, readReleases } from './releases.js'
import { selectMigrations } from './select.js'

/** Target-specific metadata with all intervening notes and selected declarative migrations. */
export async function updateDetails(ctx: Context, id: string, prefs: MarketplacePrefs): Promise<PluginDetail> {
  const from = await installedVersion(ctx.root, id)
  const versions = await readUpdateVersions(ctx, id, prefs)
  const update = selectUpdate(id, from, versions, prefs)
  if (!update) throw new PlanningError('unavailable', 'No compatible update is available')
  const history = await readReleases(ctx, id, prefs)
  const target = history.find(item => item.latest === update.to)
  if (!target) throw new PlanningError('unavailable', 'Update metadata is unavailable')
  const releases = history.filter(item => compareVersions(item.latest, from) > 0 && compareVersions(item.latest, update.to) <= 0)
    .sort((a, b) => compareVersions(b.latest, a.latest))
  const ops = selectMigrations(releases.map(item => ({ version: item.latest, manifest: item.manifest })), from, update.to)
  return {
    ...target,
    official: id.startsWith('@histoire/') && officialPlugins.some(item => item.id === id),
    installed: { version: from, enabled: true, required: false, update: update.to },
    releaseNotes: releases.flatMap(item => item.releaseNotes ?? []),
    manifest: { ...target.manifest, migrations: ops.length ? [{ from: '*', ops }] : [] },
  }
}
