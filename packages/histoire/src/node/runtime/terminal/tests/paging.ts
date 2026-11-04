import type { TestCaseDto, TestResultsPage, TestUnavailableReason } from '@histoire/cli/protocol/tests'
import { TERMINAL_BOUNDS, TerminalError } from '@histoire/cli/protocol/core'
import { TEST_PAGE_BYTES } from '@histoire/cli/protocol/tests'
import { jsonBytes } from './projection.js'

/** Empty page explaining why nothing is readable. Never an instruction to rerun. */
export function unavailablePage(operationId: string, unavailable: TestUnavailableReason): TestResultsPage {
  return { operationId, unavailable, cases: [], total: 0 }
}

/**
 * Reads one page of retained cases: at most `limit` (<= 100) entries and
 * `TEST_PAGE_BYTES` serialized bytes, so a page always fits one IPC frame.
 * Failures sort first, which makes the failed-only filter a prefix.
 * @param operationId Operation the cases belong to.
 * @param cases Retained cases, failures first.
 * @param options Cursor (index of the first case), page size and filter.
 * @param options.cursor Opaque cursor from the previous page.
 * @param options.limit Cases per page.
 * @param options.failedOnly Restrict to failed cases.
 */
export function readCasesPage(operationId: string, cases: readonly TestCaseDto[], options: { cursor?: string, limit?: number, failedOnly?: boolean }): TestResultsPage {
  if (options.cursor !== undefined && !/^\d{1,15}$/.test(options.cursor)) throw new TerminalError('invalid', 'Invalid cursor')
  const start = options.cursor === undefined ? 0 : Number(options.cursor)
  let end = cases.length
  if (options.failedOnly) {
    end = cases.findIndex(test => test.state !== 'failed')
    if (end < 0) end = cases.length
  }
  const limit = Math.min(options.limit ?? TERMINAL_BOUNDS.pageItems, TERMINAL_BOUNDS.pageItems)
  const page: TestCaseDto[] = []
  let bytes = 0
  let index = start
  for (; index < end && page.length < limit; index++) {
    const size = jsonBytes(cases[index]) + 1
    // A single entry always fits (it was bounded at projection), so progress is guaranteed.
    if (page.length && bytes + size > TEST_PAGE_BYTES) break
    page.push(cases[index])
    bytes += size
  }
  return { operationId, cases: page, total: end, ...(index < end ? { next: String(index) } : {}) }
}
