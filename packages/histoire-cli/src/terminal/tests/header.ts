import type { TestsConsole } from './console.js'
import type { ResultsList } from './results.js'
import { sanitizeText } from '../output/sanitize.js'
import { describeOperation, describeTarget } from './format.js'

/** Most uncollected stories and run errors listed before "+N more". */
const LISTED = 3

/** Wording of a result page that cannot be read. */
const UNAVAILABLE: Record<string, string> = {
  evicted: 'details were dropped by retention, totals are kept',
  retired: 'runtime restarted before the details were loaded',
  unknown: 'run is no longer tracked',
  running: 'run has not finished',
}

/** Status line above the case list. */
export function describeResultsStatus(tests: TestsConsole, results: ResultsList, shown: number): string {
  const entry = tests.viewed()
  const summary = entry?.operation.summary
  const parts: string[] = []
  if (!entry) return 'No run yet'
  if (results.status() === 'unavailable') parts.push(`Cases unavailable: ${UNAVAILABLE[results.reason() ?? ''] ?? results.reason()}`)
  else if (results.status() === 'failed') parts.push(`Cases unavailable: ${sanitizeText(results.reason() ?? 'read failed')}`)
  else if (entry.operation.state !== 'completed' || entry.lost) parts.push('Cases appear when the run completes')
  else parts.push(`${shown} of ${results.total()} ${results.failuresOnly() ? 'failed cases' : 'cases'}${results.hasMore() ? ', more to load' : ''}`)
  if (summary?.omittedCases) parts.push(`${summary.omittedCases} cases omitted, counted in totals`)
  return `\u001B[2m${parts.join(' · ')}\u001B[22m`
}

/** Empty-list text for the current load state. */
export function describeEmptyResults(tests: TestsConsole, results: ResultsList): string {
  const entry = tests.viewed()
  if (!entry) return 'Press r to run the selected scope'
  if (results.status() === 'loading') return 'Loading cases'
  if (entry.operation.state === 'completed' && results.status() === 'ready') return results.failuresOnly() ? 'No failed cases' : 'No cases ran'
  return 'No cases to show'
}

/**
 * Lines above the case list: scope selector, admission problem, the viewed run (with its
 * historical label), uncollected stories and run-level errors. Counts come from the
 * summary, never from the loaded case pages.
 * @param tests Console.
 * @param results Results list (filter state).
 */
export function buildTestsHeader(tests: TestsConsole, results: ResultsList): string[] {
  const selected = tests.selectedScope()
  const scopes = tests.scopeOptions().map((option) => {
    const label = sanitizeText(option.scope === 'all' ? option.label : `${option.scope === 'story' ? 'Story' : 'Variant'}: ${option.label}`)
    if (!option.available) return `\u001B[2m${label}${option.scope === selected ? ` (${option.reason})` : ''}\u001B[22m`
    return option.scope === selected ? `\u001B[7m ${label} \u001B[27m` : label
  })
  const lines = [`Scope  ${scopes.join('  ')}`]
  const watching = tests.watchStatus()
  if (watching) lines.push(sanitizeText(watching))
  const problem = tests.problem()
  if (problem) lines.push(`\u001B[31m${sanitizeText(problem)}\u001B[39m`)
  const entry = tests.viewed()
  if (!entry) return lines
  const { operation } = entry
  const all = tests.entries()
  const position = all.findIndex(item => item.operation.id === operation.id) + 1
  const historical = tests.historical(entry)
  const head = `Run ${all.length - position + 1} of ${all.length} · ${describeTarget(operation.target)} · revision ${operation.revision.slice(0, 8)}`
  lines.push(historical ? `\u001B[33mHistorical\u001B[39m · ${head} · ${historical}` : head)
  lines.push(entry.lost ? 'Lost · runtime ended before the run finished' : describeOperation(operation, entry.progress))
  const { summary } = operation
  if (summary) {
    for (const story of summary.uncollected.slice(0, LISTED)) lines.push(`\u001B[31mUncollected\u001B[39m ${sanitizeText(story.relativePath)} · ${sanitizeText(story.error.split('\n')[0])}`)
    const moreStories = summary.uncollected.length - LISTED + summary.omittedUncollected
    if (moreStories > 0) lines.push(`+${moreStories} more uncollected stories`)
    for (const error of summary.runErrors.slice(0, LISTED)) lines.push(`\u001B[31mError\u001B[39m ${sanitizeText(error.split('\n')[0])}`)
    const moreErrors = summary.runErrors.length - LISTED + summary.omittedRunErrors
    if (moreErrors > 0) lines.push(`+${moreErrors} more run errors`)
  }
  return lines
}

/** Footer hint of the Tests view. */
export const TESTS_FOOTER = 'Left/Right scope · r run · s stop · w watch · Enter detail · f failures · [ ] runs · / search · Esc back'
