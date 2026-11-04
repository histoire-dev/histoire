import type { TestCaseDto, TestSummaryDto } from '@histoire/cli/protocol/tests'
import type { HistoireTestCaseResult, HistoireTestRunSummary } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { truncateText } from '@histoire/cli/protocol/core'
import { sanitizeText } from '@histoire/cli/sanitize'
import { formatTestError } from '@histoire/shared'

/** Bounds applied when a summary is projected for retention and transport. */
export interface ProjectionLimits {
  /** Largest serialized case, in UTF-8 bytes; larger entries lose their error text. */
  caseBytes: number
  /** Longest error text block, in UTF-16 units. */
  errorChars: number
  /** Error blocks kept per case. */
  errorsPerCase: number
  /** Total serialized bytes of retained cases. */
  retainBytes: number
  /** Run-level errors kept. */
  runErrors: number
  /** Uncollected stories kept. */
  uncollected: number
}

/** Frozen defaults; tests override single fields. */
export const DEFAULT_PROJECTION_LIMITS: ProjectionLimits = {
  caseBytes: 16 * 1024,
  errorChars: 4096,
  errorsPerCase: 5,
  retainBytes: 8 * 1024 * 1024,
  runErrors: 20,
  uncollected: 50,
}

/** Retained, pageable part of a projected run. */
export interface ProjectedResults {
  /** Aggregate with exact totals and explicit omissions. */
  summary: TestSummaryDto
  /** Retained cases, failures first, then original order. */
  cases: TestCaseDto[]
  /** Serialized bytes of `cases`, used for store budgeting. */
  bytes: number
}

/** Sanitized, bounded text of one transported error. */
function errorText(error: HistoireTestCaseResult['errors'][number], limit: number) {
  return truncateText(sanitizeText(formatTestError(error)), limit).text
}

/** UTF-8 size of a JSON value. */
export function jsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value))
}

/** Projects one case; an entry beyond its byte bound keeps identity and state but loses error text. */
function projectCase(test: HistoireTestCaseResult, limits: ProjectionLimits): { dto: TestCaseDto, bytes: number } {
  const identity = (text: string) => truncateText(sanitizeText(text), 512).text
  const base: TestCaseDto = {
    id: identity(test.id),
    name: identity(test.name),
    fullName: identity(test.fullName),
    state: test.state,
    ...(test.storyId === undefined ? {} : { storyId: test.storyId }),
    ...(test.variantId === undefined ? {} : { variantId: test.variantId }),
    errors: test.errors.slice(0, limits.errorsPerCase).map(error => errorText(error, limits.errorChars)),
  }
  const bytes = jsonBytes(base)
  if (bytes <= limits.caseBytes) return { dto: base, bytes }
  const bounded = { ...base, errors: [], unavailable: true }
  return { dto: bounded, bytes: jsonBytes(bounded) }
}

/**
 * Projects a runner summary: sanitized, bounded cases (failures first so
 * truncation only ever drops passing/skipped entries) plus an aggregate whose
 * totals stay exact whatever was omitted.
 * @param summary Runner or merged batch summary.
 * @param limits Projection bounds.
 */
export function projectSummary(summary: HistoireTestRunSummary, limits: ProjectionLimits = DEFAULT_PROJECTION_LIMITS): ProjectedResults {
  const ordered = [...summary.tests.filter(test => test.state === 'failed'), ...summary.tests.filter(test => test.state !== 'failed')]
  const cases: TestCaseDto[] = []
  let bytes = 0
  for (const test of ordered) {
    const projected = projectCase(test, limits)
    // +1 for the array separator keeps the estimate on the safe side.
    if (bytes + projected.bytes + 1 > limits.retainBytes) break
    cases.push(projected.dto)
    bytes += projected.bytes + 1
  }
  const uncollected = summary.uncollectedStories ?? []
  return {
    cases,
    bytes,
    summary: {
      ok: summary.ok,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      retainedCases: cases.length,
      omittedCases: summary.tests.length - cases.length,
      runErrors: summary.errors.slice(0, limits.runErrors).map(error => errorText(error, limits.errorChars)),
      omittedRunErrors: Math.max(0, summary.errors.length - limits.runErrors),
      uncollected: uncollected.slice(0, limits.uncollected).map(story => ({ relativePath: truncateText(sanitizeText(story.relativePath), 512).text, error: truncateText(sanitizeText(story.error), 1024).text })),
      omittedUncollected: Math.max(0, uncollected.length - limits.uncollected),
    },
  }
}
