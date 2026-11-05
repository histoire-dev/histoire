import type { PluginDetail } from '../../../../histoire-shared/src/index.js'
import index from '../../../../histoire/src/node/marketplace/catalog/official.json'

/** Match resolvedMarketplaceOfficial: only public DTO fields and trusted bundled identity. */
export const officialPlugins: PluginDetail[] = index.map(({ history: _history, ...entry }) => ({
  ...entry as PluginDetail,
  official: entry.id.startsWith('@histoire/'),
  compatible: { ok: true },
}))

/** Fresh entry for scenarios overriding only their distinct metadata. */
export function plugin(): PluginDetail {
  return structuredClone(officialPlugins.find(item => item.id === '@histoire/plugin-a11y')!)
}
