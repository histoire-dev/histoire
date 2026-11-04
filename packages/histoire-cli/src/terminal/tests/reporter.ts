import type { TestsConsole } from './console.js'
import type { TestEntry } from './state.js'
import { sanitizeText } from '../output/sanitize.js'
import { TEST_FINAL_STATES } from '../protocol/tests.js'
import { describeOperation, describeTarget } from './format.js'
import { describeCase } from './results.js'

/** Failed cases listed in the plain summary before "+N more". */
const LISTED_FAILURES = 10
/** Longest error line printed per failure. */
const ERROR_CHARS = 200

/** Final lines of a finished entry: outcome, uncollected stories, run errors, named failures. */
async function finalLines(tests: TestsConsole, entry: TestEntry): Promise<string[]> {
  const { operation } = entry
  if (entry.lost) return ['Tests lost: the runtime ended before the run finished']
  const lines = [describeOperation(operation)]
  const { summary } = operation
  if (!summary) return lines
  for (const story of summary.uncollected) lines.push(`  Uncollected ${sanitizeText(story.relativePath)}: ${sanitizeText(story.error.split('\n')[0])}`)
  if (summary.omittedUncollected) lines.push(`  +${summary.omittedUncollected} more uncollected stories`)
  for (const error of summary.runErrors) lines.push(`  Error: ${sanitizeText(error.split('\n')[0]).slice(0, ERROR_CHARS)}`)
  if (summary.omittedRunErrors) lines.push(`  +${summary.omittedRunErrors} more run errors`)
  if (!summary.failed) return lines
  try {
    const page = await tests.state.results(operation.id, { failedOnly: true })
    if (page.unavailable) return [...lines, `  Failed case details unavailable (${page.unavailable})`]
    for (const failed of page.cases.slice(0, LISTED_FAILURES)) {
      lines.push(`  FAIL ${describeCase(failed).split('\n')[0]}`)
      if (failed.errors[0]) lines.push(`    ${sanitizeText(failed.errors[0].split('\n')[0]).slice(0, ERROR_CHARS)}`)
    }
    const hidden = summary.failed - Math.min(page.cases.length, LISTED_FAILURES)
    if (hidden > 0) lines.push(`  +${hidden} more failed cases${summary.omittedCases ? ' (some details were dropped by retention)' : ''}`)
  }
  catch (error) {
    lines.push(`  Failed case details unavailable (${error instanceof Error ? error.message : String(error)})`)
  }
  return lines
}

/**
 * Follows one admitted operation in plain output: a line per lifecycle or phase change,
 * then outcome, uncollected stories, run errors and named failures. Resolves when the
 * operation is final or its runtime is gone. Slice 10 reuses it for scheduled runs.
 * @param tests Console owning the state.
 * @param operationId Admitted operation.
 * @param report Line sink.
 */
export function followOperation(tests: TestsConsole, operationId: string, report: (line: string) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    let shown = ''
    let seen = false
    let unsubscribe = () => {}
    const check = () => {
      const entry = tests.state.get(operationId)
      if (!entry) {
        // Evicted from the bounded history while still followed: nothing more will arrive.
        if (!seen) return
        unsubscribe()
        report('Tests result is no longer retained')
        return resolve()
      }
      seen = true
      const finished = entry.lost || TEST_FINAL_STATES.includes(entry.operation.state)
      if (!finished) {
        // Progress ticks are frequent: one line per state or phase change is the decisive part.
        const key = `${entry.operation.state}|${entry.progress?.phase ?? ''}`
        if (key !== shown) report(describeOperation(entry.operation, entry.progress))
        shown = key
        return
      }
      unsubscribe()
      void finalLines(tests, entry).then(lines => lines.forEach(report)).finally(resolve)
    }
    unsubscribe = tests.subscribe(check)
    check()
  })
}

/**
 * Plain `tests`: submits the selected scope and follows it to the end. Assertion failures
 * are reported, never thrown, so they cannot change the server or its exit status.
 * @param tests Console.
 * @param report Line sink.
 */
export async function runAndReport(tests: TestsConsole, report: (line: string) => void): Promise<void> {
  const target = tests.runnable().target
  const admitted = await tests.run()
  if ('problem' in admitted) return report(admitted.problem)
  report(`Tests queued: ${target ? describeTarget(target) : 'selected scope'}`)
  await followOperation(tests, admitted.id, report)
}
