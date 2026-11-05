import type { PluginDetail } from '@histoire/shared'
import type { ProjectSignals } from './signals.js'

/** Fixed collection titles; registry content supplies only memberships. */
const collectionTitles = { 'visual-testing': 'Visual testing', 'design-handoff': 'Design handoff', 'inspection': 'Inspection', 'data-mocks': 'Data & mocks' }
/** Explain applicable recommendations and retain only compatible, uninstalled picks. */
export function discoverCatalog(entries: PluginDetail[], project: ProjectSignals, installedCategories: Set<string>) {
  const picks = entries.flatMap((entry) => {
    if (entry.installed || !entry.compatible.ok) return []
    const rule = entry.manifest.recommend?.find(rule => 'dependency' in rule ? project.dependencies.includes(rule.dependency) : !installedCategories.has(entry.category))
    return rule ? [{ ...entry, reason: rule.reason }] : []
  })
  return {
    hero: picks[0],
    picks: picks.slice(1, 7),
    collections: Object.entries(collectionTitles).map(([id, title]) => ({ id, title, entries: entries.filter(entry => entry.manifest.collections?.includes(id)) })).filter(collection => collection.entries.length),
  }
}
