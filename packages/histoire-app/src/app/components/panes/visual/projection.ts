import type { UiVisualResult } from '@histoire/shared'

/** Panel result scope: unapproved differences, failed captures, or every comparison. */
export type VisualFilter = 'changes' | 'errors' | 'all'

/** Non-passing statuses shown in summary, in severity order. */
export const VISUAL_ISSUE_STATUSES = ['stale', 'changed', 'missing', 'incompatible', 'error', 'cancelled'] as const

/** Totals per displayed outcome; approved results count as passed. */
export type VisualCounts = Record<'passed' | typeof VISUAL_ISSUE_STATUSES[number], number>

/** One fixed-height row in the flattened virtual result list. */
export type VisualEntry =
  | { key: string, kind: 'heading', storyId: string, title: string, passed: number, total: number }
  | { key: string, kind: 'result', result: UiVisualResult, label: string }

/** Approved captures no longer need review. */
export function isVisualChange(result: UiVisualResult): boolean {
  return !!result.staleReason || (!result.approved && result.status !== 'passed')
}

/** Shared list and empty-state predicate; stale failed captures remain findable. */
export function matchesVisualFilter(result: UiVisualResult, filter: VisualFilter): boolean {
  if (filter === 'errors') return result.status === 'error'
  return filter === 'all' || isVisualChange(result)
}

/** Case labels usually repeat story title (`Story › Variant`); heading already shows it. */
function trimLabel(label: string, storyTitle: string): string {
  const prefix = `${storyTitle} › `
  return label.startsWith(prefix) && label.length > prefix.length ? label.slice(prefix.length) : label
}

/** Group results by story in run order, applying filter and collapsed stories. */
export function projectVisualRows(results: readonly UiVisualResult[], storyTitle: (storyId: string) => string, filter: VisualFilter, closed: ReadonlySet<string>): VisualEntry[] {
  const groups = new Map<string, UiVisualResult[]>()
  for (const result of results) {
    const group = groups.get(result.case.storyId)
    if (group) group.push(result)
    else groups.set(result.case.storyId, [result])
  }
  const entries: VisualEntry[] = []
  for (const [storyId, all] of groups) {
    const changes = all.filter(isVisualChange)
    const visible = all.filter(result => matchesVisualFilter(result, filter))
    if (!visible.length) continue
    const title = storyTitle(storyId)
    entries.push({ key: `story:${storyId}`, kind: 'heading', storyId, title, passed: all.length - changes.length, total: all.length })
    if (closed.has(storyId)) continue
    entries.push(...visible.map(result => ({ key: `result:${result.id}`, kind: 'result' as const, result, label: trimLabel(result.case.label, title) })))
  }
  return entries
}

/** Summary totals for progress bar and counters. */
export function countVisualResults(results: readonly UiVisualResult[]): VisualCounts {
  const counts: VisualCounts = { passed: 0, stale: 0, changed: 0, missing: 0, incompatible: 0, error: 0, cancelled: 0 }
  for (const result of results) {
    counts[result.staleReason ? 'stale' : result.approved ? 'passed' : result.status]++
  }
  return counts
}
