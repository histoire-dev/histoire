import type { PluginDetail } from '@histoire/shared'
import { officialPlugins } from '../marketplace/catalog/official.js'

/** Public module identity shared by static and development workbenches. */
export const MARKETPLACE_OFFICIAL_ID = 'virtual:$histoire-marketplace-official'
/** Internal Vite module identity. */
export const RESOLVED_MARKETPLACE_OFFICIAL_ID = `\0${MARKETPLACE_OFFICIAL_ID}`

/** Export rich offline details without installed state or project-specific restrictions. */
export function resolvedMarketplaceOfficial(): string {
  return `export const officialPlugins = ${JSON.stringify(officialPlugins.map((detail: PluginDetail & { /** Node-only release history. */ history?: unknown }) => {
    const { installed: _installed, history: _history, ...entry } = detail
    return { ...entry, compatible: { ok: true } }
  }))}`
}
