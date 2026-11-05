import type { CatalogEntry, PluginId } from '@histoire/shared'
import type { Context } from '../../context.js'

/** Generation-owned projection; contexts are discarded on every configuration restart. */
const installedIndexes = new WeakMap<Context, Map<PluginId, CatalogEntry['installed']>>()

/** Join catalog/jobs by npm identity, preserving the first configured duplicate deterministically. */
export function getInstalledIndex(ctx: Context): Map<PluginId, CatalogEntry['installed']> {
  let index = installedIndexes.get(ctx)
  if (!index) {
    index = new Map()
    for (const row of ctx.pluginInventory ?? []) {
      if (!row.packageName || !row.version || index.has(row.packageName)) continue
      index.set(row.packageName, { version: row.version, enabled: row.enabled, required: row.required })
    }
    installedIndexes.set(ctx, index)
  }
  return index
}
