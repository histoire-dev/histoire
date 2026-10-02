import type { McpOperation, McpTestResult } from '../protocol/operation-schema.js'
import type { OperationRecord } from './types.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS, mcpByteLength } from '../protocol/limits.js'

/** Retain counters while paging every failure/case/collection detail explicitly. */
export function projectOperationPage<T>(record: OperationRecord<T>, offset = 0, limit = 100) {
  const dto: McpOperation = { ...record.dto }
  const result = record.output?.result
  if (result) dto.result = result
  if (!result || !('summary' in result)) return dto
  const full = result as McpTestResult
  const entries = [
    ...full.summary.errors.map(value => ({ kind: 'error' as const, value })),
    ...(full.summary.uncollectedStories ?? []).map(value => ({ kind: 'uncollected' as const, value })),
    ...full.summary.tests.map(value => ({ kind: 'test' as const, value })),
  ]
  const summary = { ...full.summary, errors: [], tests: [], ...(full.summary.uncollectedStories ? { uncollectedStories: [] } : {}) } as McpTestResult['summary']
  dto.result = { ...full, summary, truncated: offset > 0 || entries.length > limit }
  let end = offset
  for (const entry of entries.slice(offset, offset + limit)) {
    if (entry.kind === 'error') summary.errors.push(entry.value)
    else if (entry.kind === 'uncollected') summary.uncollectedStories!.push(entry.value)
    else summary.tests.push(entry.value)
    if (mcpByteLength(JSON.stringify(dto)) > MCP_LIMITS.responseBytes - 4096) {
      if (entry.kind === 'error') summary.errors.pop()
      else if (entry.kind === 'uncollected') summary.uncollectedStories!.pop()
      else summary.tests.pop()
      if (end === offset) throw new McpDomainError('RESULT_TOO_LARGE', 'One retained test detail exceeds resource page limit', false, { offset })
      break
    }
    end++
  }
  dto.result.truncated = offset > 0 || end < entries.length
  return { ...dto, page: { offset, nextOffset: end < entries.length ? end : undefined, totalEntries: entries.length } }
}

/** Tool DTO omits paging metadata; truncated result advertises resource pagination. */
export function projectOperation<T>(record: OperationRecord<T>): McpOperation {
  const page = projectOperationPage(record)
  if ('page' in page) {
    const { page: _page, ...dto } = page
    return dto
  }
  return page
}
