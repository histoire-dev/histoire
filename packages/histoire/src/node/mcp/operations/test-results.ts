import type { HistoireTestError, HistoireTestRunSummary } from '@histoire/shared'
import { sanitizeDiagnosticMessage } from '../project/diagnostics.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS, mcpByteLength } from '../protocol/limits.js'

/** Scrubbing inputs captured privately; credentials never become result metadata. */
export interface TestResultSanitizeOptions {
  /** Canonical project root removed from every public string. */
  root: string
  /** Optional transport credential removed from error and test names. */
  secret?: string
}

/** Reuse catalog error scrubbing and its byte-safe 4 KiB text bound. */
function text(value: unknown, options: TestResultSanitizeOptions): string {
  return sanitizeDiagnosticMessage(value, options.root, options.secret)
}

/** Wire error explicitly excludes raw, cause, matcher objects and environment. */
function error(value: HistoireTestError, options: TestResultSanitizeOptions): HistoireTestError {
  if (typeof value === 'string') return text(value, options)
  return {
    message: text(value.message, options),
    ...(value.name ? { name: text(value.name, options) } : {}),
    ...(value.stack ? { stack: text(value.stack, options) } : {}),
    ...(value.diff ? { diff: text(value.diff, options) } : {}),
  }
}

/** Sanitize shared summary once, keeping counters and paged failures under full-result budget. */
export function sanitizeMcpTestSummary(value: HistoireTestRunSummary, options: TestResultSanitizeOptions): HistoireTestRunSummary {
  const summary: HistoireTestRunSummary = {
    ok: value.ok,
    total: value.total,
    passed: value.passed,
    failed: value.failed,
    skipped: value.skipped,
    errors: [],
    tests: [],
    ...(value.uncollectedStories ? { uncollectedStories: [] } : {}),
  }
  let bytes = mcpByteLength(JSON.stringify(summary)) + 4096
  /** Bound allocation incrementally; never retain an unbounded completed runner result. */
  function retain<T>(target: T[], entry: T) {
    bytes += mcpByteLength(JSON.stringify(entry)) + 1
    if (bytes > MCP_LIMITS.artifactBytes) {
      throw new McpDomainError('RESULT_TOO_LARGE', 'Sanitized test result exceeds retention limit', false, {
        total: value.total,
        passed: value.passed,
        failed: value.failed,
        skipped: value.skipped,
      })
    }
    target.push(entry)
  }
  for (const item of value.errors) retain(summary.errors, error(item, options))
  for (const item of value.uncollectedStories ?? []) {
    retain(summary.uncollectedStories!, { relativePath: item.relativePath, error: text(item.error, options) })
  }
  for (const item of value.tests) {
    // One pathological case must still fit one resource page. Preserve state and
    // count of summarized errors explicitly rather than hiding failed outcomes.
    const projected = {
      id: text(item.id, options),
      name: text(item.name, options),
      fullName: text(item.fullName, options),
      state: item.state,
      errors: [] as HistoireTestError[],
      ...(item.storyId === undefined ? {} : { storyId: item.storyId }),
      ...(item.variantId === undefined ? {} : { variantId: item.variantId }),
    }
    let caseBytes = mcpByteLength(JSON.stringify(projected))
    for (const value of item.errors) {
      const detail = error(value, options)
      const bytes = mcpByteLength(JSON.stringify(detail)) + 1
      if (caseBytes + bytes > MCP_LIMITS.responseBytes - 32 * 1024) break
      projected.errors.push(detail)
      caseBytes += bytes
    }
    if (projected.errors.length < item.errors.length) {
      projected.errors.push({ message: `[truncated oversized test case: ${item.errors.length - projected.errors.length} additional errors; state=${item.state}]` })
    }
    retain(summary.tests, projected)
  }
  return summary
}
