import type { HistoireCatalog, HistoireTarget } from '@histoire/protocol'
import type { WorkbenchTestEntry, WorkbenchTestRow, WorkbenchTestsSummary } from './types.js'
import { getHistoireTargetKey } from '@histoire/protocol'

/** New variants start data-only, without execution or guessed results. */
export function emptyTestEntry(target: HistoireTarget): WorkbenchTestEntry {
  return { target, collection: null, summary: null, duration: null, stale: false, error: null, running: false }
}

/** Build catalog-order rows and surface every collection diagnostic once. */
export function projectTestRows(catalog: HistoireCatalog, entries: ReadonlyMap<string, WorkbenchTestEntry>): WorkbenchTestRow[] {
  const rows: WorkbenchTestRow[] = []
  for (const story of catalog.stories) {
    if (story.docsOnly) continue
    for (const variant of story.variants) {
      const target = { storyId: story.id, variantId: variant.id }
      const key = getHistoireTargetKey(target)
      const entry = entries.get(key) ?? emptyTestEntry(target)
      // Successful refreshed collection supersedes an older run's collection failure.
      const issue = entry.error ?? entry.collection?.error ?? (!entry.collection ? entry.summary?.uncollectedStories?.[0]?.error : undefined)
      rows.push({ ...entry, error: issue, hasTests: variant.hasTests, key, storyTitle: story.title, variantTitle: variant.title, failed: !!issue || (!entry.stale && (entry.summary?.failed ?? 0) > 0), notCollected: !!issue, selectable: true })
    }
  }
  const seen = new Set<string>()
  for (const diagnostic of catalog.diagnostics) {
    if (diagnostic.severity !== 'error') continue
    const story = catalog.stories.find(story => story.id === diagnostic.storyId)
    const label = diagnostic.storyId ?? diagnostic.relativePath ?? diagnostic.message
    if (seen.has(label)) continue
    seen.add(label)
    const target = { storyId: diagnostic.storyId ?? label, variantId: null }
    rows.push({ ...emptyTestEntry(target), key: `diagnostic:${label}`, storyTitle: story?.title ?? diagnostic.relativePath ?? label, error: diagnostic.message, failed: true, notCollected: true, selectable: !!story })
  }
  return rows
}

/** Successful current collection overrides historical results and catalog hints. */
export function isVisibleTestRow(row: WorkbenchTestRow): boolean {
  if (row.notCollected || row.error) return true
  if (row.collection) return row.collection.definitions.length > 0
  return (row.summary?.total ?? 0) > 0 || row.hasTests === true
}

/** Preserve unknown, skipped, failed and stale distinctions in summary. */
export function summarizeTestRows(rows: readonly WorkbenchTestRow[]): WorkbenchTestsSummary {
  const summary: WorkbenchTestsSummary = { passed: 0, failed: 0, skipped: 0, stale: 0, notCollected: 0, idle: 0, duration: 0 }
  for (const row of rows) {
    if (row.notCollected) {
      summary.notCollected++
      continue
    }
    if (row.stale) {
      summary.stale++
      continue
    }
    summary.duration += row.duration ?? 0
    if (row.summary) {
      summary.passed += row.summary.passed
      summary.failed += row.summary.failed
      summary.skipped += row.summary.skipped
    }
    else {
      for (const definition of row.collection?.definitions ?? []) {
        if (definition.mode === 'skip' || definition.mode === 'todo') summary.skipped++
        else summary.idle++
      }
    }
  }
  return summary
}
