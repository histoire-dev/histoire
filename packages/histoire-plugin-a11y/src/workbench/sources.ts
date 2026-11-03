import type { TestsEntry } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { AuditReport } from '../messages.js'
import { HISTOIRE_VARIANT_ERROR_TEST_NAME } from '@histoire/shared'
import { A11Y_TEST_DATA_KEY, A11Y_TEST_NAME } from '../results.js'

/** Accessibility outcome of one variant, from a test run or a build report. */
export interface A11yResult {
  /** Checked variant. */
  target: HistoireTarget & { variantId: string }
  /** Bounded findings; absent while running or after a failed check. */
  report?: AuditReport
  /** Failure that kept the check from reporting. */
  error?: string
  /** Sources changed since the check. */
  stale?: boolean
  /** A check of the variant is in progress. */
  running?: boolean
}

/** Accessibility report embedded into static books by the `build` option. */
export interface A11yBuildReport {
  /** Format version. */
  version: 1
  /** ISO time the build scanned the variants. */
  generatedAt: string
  /** One result per scanned variant. */
  results: A11yResult[]
}

/** Plain object guard. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Structural check of a bounded report received from a test result or a file. */
export function isAuditReport(value: unknown): value is AuditReport {
  if (!isRecord(value) || !Array.isArray(value.violations) || !Array.isArray(value.incomplete)) return false
  if (![value.violationsCount, value.incompleteCount].every(count => Number.isSafeInteger(count))) return false
  // Rules render id, help, impact and node selectors; anything else is optional.
  return [...value.violations, ...value.incomplete].every(rule => isRecord(rule) && typeof rule.id === 'string' && typeof rule.help === 'string' && Array.isArray(rule.nodes))
}

/** Variant target with a concrete variant id. */
function isVariantTarget(value: unknown): value is A11yResult['target'] {
  return isRecord(value) && typeof value.storyId === 'string' && typeof value.variantId === 'string'
}

/**
 * Reads accessibility results out of project test entries: only the case registered by the
 * `test` option counts; a failed case without data reports its first error.
 * @param entries Entries of the host tests service.
 */
export function resultsFromTests(entries: readonly TestsEntry[]): A11yResult[] {
  const results: A11yResult[] = []
  for (const entry of entries) {
    if (!isVariantTarget(entry.target)) continue
    // A variant that broke outside its test cases (import, mount) never ran the check: report that failure.
    const test = entry.summary?.tests.find(test => test.name === A11Y_TEST_NAME)
      ?? entry.summary?.tests.find(test => test.name === HISTOIRE_VARIANT_ERROR_TEST_NAME && test.state === 'failed')
    // Variants without the case are not checked, unless a run is about to report them. A failure of
    // the whole run is reported once by the source, not on every variant.
    if (!test && !entry.running) continue
    // Read as unknown: the deep readonly JSON type is validated structurally below.
    const data: unknown = (test?.data as Record<string, unknown> | undefined)?.[A11Y_TEST_DATA_KEY]
    const report = isRecord(data) && isAuditReport(data.report) ? data.report : undefined
    const failure = test?.state === 'failed' && !report ? test.errors[0] : undefined
    const error = failure === undefined ? undefined : typeof failure === 'string' ? failure : failure.message
    results.push({ target: entry.target, report, ...(error ? { error } : {}), stale: entry.stale, running: entry.running })
  }
  return results
}

/**
 * Validates a build report file; malformed content reads as `undefined`.
 * @param value Parsed JSON.
 */
export function parseBuildReport(value: unknown): A11yBuildReport | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.generatedAt !== 'string' || !Array.isArray(value.results)) return
  for (const result of value.results) {
    if (!isRecord(result) || !isVariantTarget(result.target)) return
    if (result.report !== undefined && !isAuditReport(result.report)) return
    if (result.error !== undefined && typeof result.error !== 'string') return
  }
  return value as unknown as A11yBuildReport
}
