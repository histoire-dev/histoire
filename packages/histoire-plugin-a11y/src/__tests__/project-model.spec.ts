import type { TestsEntry } from '@histoire/plugin-kit'
import { HISTOIRE_VARIANT_ERROR_TEST_NAME } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { A11Y_TEST_NAME } from '../results.js'
import { projectGroups, violationBadge, worstImpact } from '../workbench/project-model.js'
import { parseBuildReport, resultsFromTests } from '../workbench/sources.js'

/** Bounded report with the given violating rules. */
function report(violations: Array<[id: string, impact: string | null]>, incomplete: string[] = []) {
  const rule = (id: string, impact: string | null) => ({ id, impact, help: id, helpUrl: `https://rules/${id}`, nodes: [{ selectors: ['#a'] }] })
  return { violations: violations.map(([id, impact]) => rule(id, impact)), incomplete: incomplete.map(id => rule(id, 'minor')), violationsCount: violations.length, incompleteCount: incomplete.length, passesCount: 3, inapplicableCount: 1, droppedCount: 0, truncated: false } as any
}

/** Tests entry of one variant with the given test cases. */
function entry(variantId: string, tests: any[], extra: Partial<TestsEntry> = {}): TestsEntry {
  return { target: { storyId: 'story', variantId }, summary: { ok: true, total: tests.length, passed: 0, failed: 0, skipped: 0, errors: [], tests } as any, running: false, stale: false, error: null, ...extra }
}

describe('a11y results from test runs', () => {
  it('keeps only the accessibility case and falls back to its or the variant error', () => {
    const results = resultsFromTests([
      entry('one', [{ name: 'other', state: 'passed', errors: [] }, { name: A11Y_TEST_NAME, state: 'failed', errors: [], data: { a11y: { report: report([['image-alt', 'critical']]) } } }]),
      entry('two', [{ name: A11Y_TEST_NAME, state: 'failed', errors: [{ message: 'Accessibility check timed out' }] }], { stale: true }),
      entry('three', [{ name: 'other', state: 'passed', errors: [] }]),
      entry('four', [], { summary: null, running: true }),
      entry('five', [], { summary: null, error: 'Run failed' }),
      entry('six', [{ name: HISTOIRE_VARIANT_ERROR_TEST_NAME, state: 'failed', errors: [{ message: 'Failed to import test file' }] }]),
    ])
    expect(results.map(result => result.target.variantId)).toEqual(['one', 'two', 'four', 'six'])
    expect(results[0].report?.violationsCount).toBe(1)
    expect(results[1]).toMatchObject({ error: 'Accessibility check timed out', stale: true })
    expect(results[2]).toMatchObject({ running: true, report: undefined })
    // A variant that broke before its checks ran still shows up as failed.
    expect(results[3]).toMatchObject({ error: 'Failed to import test file' })
  })

  it('accepts only well-formed build reports', () => {
    const value = { version: 1, generatedAt: '2026-11-03T10:00:00.000Z', results: [{ target: { storyId: 's', variantId: 'v' }, report: report([]) }, { target: { storyId: 's', variantId: 'w' }, error: 'boom' }] }
    expect(parseBuildReport(value)?.results).toHaveLength(2)
    for (const invalid of [null, [], { version: 2, results: [] }, { version: 1, results: [{ target: { storyId: 's' } }] }, { version: 1, results: [{ target: { storyId: 's', variantId: 'v' }, report: { violations: 'x' } }] }]) {
      expect(parseBuildReport(invalid)).toBeUndefined()
    }
  })
})

describe('project groups', () => {
  const titles = (target: { variantId: string }) => ({ story: 'Button', variant: target.variantId.toUpperCase() })
  const results = [
    { target: { storyId: 'story', variantId: 'a' }, report: report([['region', 'moderate']], ['color-contrast']) },
    { target: { storyId: 'story', variantId: 'b' }, report: report([['button-name', 'critical'], ['list', 'serious']]) },
    { target: { storyId: 'story', variantId: 'c' }, report: report([]) },
    { target: { storyId: 'story', variantId: 'd' }, error: 'Accessibility check failed' },
  ]

  it('orders affected variants by worst impact and totals findings', () => {
    const { groups, totals } = projectGroups(results, titles, { outcome: 'violations', severity: 'all' })
    expect(groups.map(group => group.target.variantId)).toEqual(['d', 'b', 'a'])
    expect(groups[1].findings.map(rule => rule.id)).toEqual(['button-name', 'list'])
    expect(groups[1]).toMatchObject({ storyTitle: 'Button', variantTitle: 'B' })
    expect(totals).toEqual({ checked: 3, affected: 2, violations: 3, failed: 1 })
  })

  it('filters by outcome and severity', () => {
    expect(projectGroups(results, titles, { outcome: 'violations', severity: 'critical' }).groups.map(group => group.target.variantId)).toEqual(['d', 'b'])
    expect(projectGroups(results, titles, { outcome: 'incomplete', severity: 'all' }).groups.map(group => group.target.variantId)).toEqual(['d', 'a'])
  })
})

describe('worst impact', () => {
  it('picks the most severe known impact', () => {
    expect(worstImpact(report([['region', 'moderate'], ['button-name', 'critical'], ['list', 'serious']]).violations)).toBe('critical')
    expect(worstImpact(report([['region', null]]).violations)).toBeUndefined()
    expect(worstImpact([])).toBeUndefined()
  })
})

describe('frame header badge', () => {
  it('counts violations with the tone of the worst impact', () => {
    expect(violationBadge(report([['region', 'moderate'], ['button-name', 'critical']]))).toEqual({ text: 2, tone: 'danger', label: '2 accessibility violations' })
    expect(violationBadge(report([['heading-order', 'moderate']]))).toEqual({ text: 1, tone: 'warning', label: '1 accessibility violation' })
    expect(violationBadge(report([['region', 'minor']]))?.tone).toBe('neutral')
    expect(violationBadge(report([]))).toBeNull()
    expect(violationBadge(undefined)).toBeNull()
  })
})
