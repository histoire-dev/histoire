import type { UiAgentRegistryEntry, UiAgentSettings } from '@histoire/shared'
import { ACP_REGISTRY_ALIASES } from '@histoire/shared'

/** One deduplicated settings row, preserving legacy credential identities. */
export interface AgentCatalogRow {
  /** Local ID when configured, otherwise canonical registry ID. */
  id: string
  /** Effective configured display name. */
  name: string
  /** Matched registry metadata, absent for standalone custom commands. */
  registryEntry?: UiAgentRegistryEntry
}

/** Configured commands win; full catalog remains independent of preset count limit. */
export function agentCatalogRows(settings: UiAgentSettings, entries: UiAgentRegistryEntry[], query = ''): AgentCatalogRow[] {
  const represented = new Set<string>()
  const rows = settings.presets.map((preset) => {
    const registryId = preset.registryId ?? ACP_REGISTRY_ALIASES[preset.id] ?? preset.id
    represented.add(registryId)
    return { id: preset.id, name: preset.name, registryEntry: entries.find(entry => entry.id === registryId) }
  })
  for (const entry of entries) {
    if (!represented.has(entry.id)) rows.push({ id: entry.id, name: entry.name, registryEntry: entry })
  }
  const text = query.trim().toLowerCase()
  const defaultId = settings.presets.find(preset => preset.default)?.id
  /** Stable priority groups keep alphabetical order within each group. */
  function priority(id: string): number {
    return id === defaultId ? 0 : settings.enabledIds.includes(id) ? 1 : 2
  }
  return rows.filter(row => !text || [row.id, row.name, row.registryEntry?.id].some(value => value?.toLowerCase().includes(text))).sort((first, second) => priority(first.id) - priority(second.id) || first.name.localeCompare(second.name) || first.id.localeCompare(second.id))
}
