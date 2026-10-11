import type { HistoireVisualResult } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { countVisualResults, projectVisualRows } from '../../../histoire-app/src/app/components/panes/visual/projection.js'

/** Minimal result carrying only identity, labels, and outcome used by the panel. */
function result(id: string, storyId: string, label: string, profile: string, status: HistoireVisualResult['status'], approved = false): HistoireVisualResult {
  return { id, case: { id: `${storyId}:${label}`, storyId, label }, spec: { id: profile }, status, approved, images: {}, workingRevision: null } as unknown as HistoireVisualResult
}

const results = [
  result('1', 'card', 'Card › One', 'light', 'passed'),
  result('2', 'card', 'Card › One', 'dark', 'changed'),
  result('3', 'card', 'Card › Two', 'light', 'missing', true),
  result('4', 'button', 'Primary', 'light', 'passed'),
]
const titles = new Map([['card', 'Card'], ['button', 'Button']])

describe('visual result rows', () => {
  it('keeps only unapproved changes and drops stories without any', () => {
    const rows = projectVisualRows(results, id => titles.get(id) ?? id, 'changes', new Set())
    expect(rows.map(row => row.kind === 'heading' ? `# ${row.title} ${row.passed}/${row.total}` : `${row.label} ${row.result.spec.id}`)).toEqual([
      '# Card 2/3',
      'One dark',
    ])
  })

  it('lists every result, trims story prefix, and hides collapsed story rows', () => {
    const rows = projectVisualRows(results, id => titles.get(id) ?? id, 'all', new Set(['button']))
    expect(rows.map(row => row.kind === 'heading' ? `# ${row.title}` : `${row.label} ${row.result.spec.id}`)).toEqual([
      '# Card',
      'One light',
      'One dark',
      'Two light',
      '# Button',
    ])
  })

  it('isolates errors across stories and profiles, including stale failed captures', () => {
    const comparisons = [
      ...results,
      result('5', 'card', 'Card › Broken', 'light', 'error'),
      result('6', 'button', 'Broken', 'dark', 'error'),
      result('7', 'button', 'Stopped', 'light', 'cancelled'),
      result('8', 'button', 'Size mismatch', 'light', 'incompatible'),
      { ...result('9', 'button', 'Old failure', 'light', 'error'), staleReason: 'Source changed' },
      result('10', 'button', 'No baseline', 'dark', 'missing'),
      { ...result('11', 'button', 'Old pass', 'dark', 'passed'), staleReason: 'Source changed' },
    ]
    const rows = projectVisualRows(comparisons, id => titles.get(id) ?? id, 'errors', new Set())
    expect(rows.map(row => row.kind === 'heading' ? `# ${row.title} ${row.passed}/${row.total}` : `${row.result.id} ${row.label} ${row.result.spec.id}`)).toEqual([
      '# Card 2/4',
      '5 Broken light',
      '# Button 1/7',
      '6 Broken dark',
      '9 Old failure light',
    ])
    expect(projectVisualRows(comparisons, id => titles.get(id) ?? id, 'errors', new Set(['card', 'button'])).map(row => row.key)).toEqual(['story:card', 'story:button'])
  })

  it('returns no rows when comparisons contain no errors', () => {
    expect(projectVisualRows(results, id => titles.get(id) ?? id, 'errors', new Set())).toEqual([])
  })

  it('counts approved results as passed', () => {
    expect(countVisualResults(results)).toEqual({ passed: 3, stale: 0, changed: 1, missing: 0, incompatible: 0, error: 0, cancelled: 0 })
  })
})
