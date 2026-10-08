import type { HistoireSerializedTestDefinition, HistoireTestCaseResult, HistoireTestError, HistoireTestRunSummary } from '@histoire/protocol'
import type { VNode } from 'vue'
import { BuiltinIcon, HstPulsatingDisc } from '@histoire/controls/vue'
import { h } from 'vue'

/** Displayed test state; `running` marks definitions awaiting an active run. */
export type HistoireTestRowState = 'passed' | 'failed' | 'skipped' | 'idle' | 'running'

/** One virtual list entry projected from results or collected definitions. */
export interface HistoireTestRow {
  /** Stable test identity. */
  key: string
  /** Result or definition with its display names. */
  test: HistoireTestCaseResult | HistoireSerializedTestDefinition
  /** Resolved display state. */
  state: HistoireTestRowState
}

/** Icon and accessible label for each displayed state. */
const STATES: Record<HistoireTestRowState, { icon?: string, label: string, disc?: boolean }> = {
  passed: { icon: 'checkmark-filled', label: 'Passed' },
  failed: { icon: 'error-filled', label: 'Failed' },
  skipped: { icon: 'skip-forward', label: 'Skipped', disc: true },
  idle: { icon: 'circle-dash', label: 'Not run' },
  running: { label: 'Running' },
}

/** Results take precedence; definitions fall back to skipped, running or not run. */
export function projectTestRows(summary: HistoireTestRunSummary | null | undefined, definitions: readonly HistoireSerializedTestDefinition[], busy: boolean): HistoireTestRow[] {
  if (summary?.tests.length) return summary.tests.map(test => ({ key: test.id, test, state: test.state }))
  return definitions.map(test => ({
    key: test.id,
    test,
    state: test.mode === 'skip' || test.mode === 'todo' ? 'skipped' : busy ? 'running' : 'idle',
  }))
}

/** Non-zero result counts, e.g. `2 passed · 1 failed`, each tinted by its state. */
export function renderTestCounts(summary: HistoireTestRunSummary): string | (VNode | string)[] {
  const parts = ([['passed', summary.passed], ['failed', summary.failed], ['skipped', summary.skipped]] as const).filter(([, count]) => count > 0)
  if (!parts.length) return 'No tests run'
  return parts.flatMap(([state, count], index) => {
    const label = h('span', { 'key': state, 'data-state': state }, `${count} ${state}`)
    return index ? [' · ', label] : [label]
  })
}

/**
 * Status glyph exposed as an image with its state name; running uses the standard loader.
 * Carbon has no filled skip glyph, so `disc` states draw the outline glyph inside a filled
 * disc sized like Carbon's `*-filled` circles (14px within the 16px slot).
 */
export function renderTestStateIcon(state: HistoireTestRowState): VNode {
  const { icon, label, disc } = STATES[state]
  const glyph = !icon
    ? h(HstPulsatingDisc, { size: 14 })
    : disc
      ? h('span', { class: 'histoire-test-state-disc' }, h(BuiltinIcon, { 'icon': icon, 'size': 10, 'aria-hidden': 'true' }))
      : h(BuiltinIcon, { 'icon': icon, 'size': 16, 'aria-hidden': 'true' })
  return h('span', { 'class': 'histoire-test-state', 'data-state': state, 'role': 'img', 'aria-label': label, 'title': label }, glyph)
}

/**
 * Splits suite path from test's own name. Server results repeat the
 * suite-qualified name in `name`, so `fullName` is the only reliable source.
 */
function splitSuite(fullName: string): { suite: string[], name: string } {
  const parts = fullName.split(' > ')
  return { suite: parts.slice(0, -1), name: parts.at(-1) ?? fullName }
}

/** Diff lines tinted by their `+`/`-` marker; text content stays identical. */
function renderDiff(diff: string): VNode {
  const lines = diff.split('\n')
  return h('pre', { 'class': 'histoire-test-error-diff', 'aria-label': 'Assertion difference' }, lines.flatMap((line, index) => [
    h('span', { 'data-diff': line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : undefined }, line),
    index < lines.length - 1 ? '\n' : null,
  ]))
}

/** Serialized assertion details remain text; source excerpts in stacks are never executed. */
export function renderTestError(error: HistoireTestError, index: number): VNode {
  if (typeof error === 'string') return h('div', { key: index, class: 'histoire-test-error' }, h('p', { class: 'histoire-test-error-message' }, error))
  return h('div', { key: index, class: 'histoire-test-error' }, [
    h('p', { class: 'histoire-test-error-message' }, error.name && !error.message.startsWith(error.name) ? `${error.name}: ${error.message}` : error.message),
    error.diff ? renderDiff(error.diff) : null,
    error.stack
      ? h('details', { class: 'histoire-test-error-stack' }, [
          h('summary', 'Stack trace'),
          h('pre', { 'aria-label': 'Error stack and source excerpt' }, error.stack),
        ])
      : null,
  ])
}

/** One test line with status, muted suite path and inline failure details. */
export function renderTestRow(row: HistoireTestRow): VNode {
  const { test, state } = row
  const { suite, name } = splitSuite(test.fullName || test.name)
  const errors = 'errors' in test ? test.errors : []
  return h('div', { 'class': 'histoire-test-row', 'data-state': state }, [
    h('div', { class: 'histoire-test-row-main' }, [
      renderTestStateIcon(state),
      h('span', { class: 'histoire-test-name' }, [
        suite.length ? h('span', { class: 'histoire-test-suite' }, `${suite.join(' › ')} › `) : null,
        name,
      ]),
    ]),
    errors.length ? h('div', { class: 'histoire-test-errors' }, errors.map(renderTestError)) : null,
  ])
}

/**
 * Split result bar with one segment per non-empty state, sized by its count;
 * indeterminate while running. Empty states render nothing so the bar shows no stray gaps.
 */
export function renderTestProgress(summary: HistoireTestRunSummary | null | undefined, busy: boolean): VNode | null {
  if (busy) return h('div', { 'class': 'histoire-tests-progress', 'data-running': '', 'aria-hidden': 'true' }, h('span'))
  if (!summary?.total) return null
  const segments = ([['passed', summary.passed], ['failed', summary.failed], ['skipped', summary.skipped]] as const).filter(([, count]) => count > 0)
  return h('div', { 'class': 'histoire-tests-progress', 'aria-hidden': 'true' }, segments.map(([state, count]) => h('span', { 'key': state, 'data-state': state, 'style': { flexGrow: count } })))
}
