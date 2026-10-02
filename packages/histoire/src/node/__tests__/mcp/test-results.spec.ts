import type { HistoireTestRunSummary } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { sanitizeMcpTestSummary } from '../../mcp/operations/test-results.js'

/** Shared result shape with exact counters and scoped duplicate variant IDs. */
function summary(): HistoireTestRunSummary {
  return { ok: false, total: 2, passed: 1, failed: 1, skipped: 0, errors: [], tests: [
    { id: 'a', name: 'passing', fullName: 'first passing', state: 'passed', errors: [], storyId: 'first', variantId: 'shared' },
    { id: 'b', name: 'failing', fullName: 'second failing', state: 'failed', errors: [], storyId: 'second', variantId: 'shared' },
  ] }
}

describe('shared MCP test sanitization', () => {
  it('drops raw matcher/cause objects and scrubs roots/secrets while preserving outcomes and scoped IDs', () => {
    const value = summary()
    value.tests[1].errors = [{ message: '/private/project fail token-123', stack: '/private/project/file.ts', diff: 'token-123', raw: { password: 'secret' } }]
    const result = sanitizeMcpTestSummary(value, { root: '/private/project', secret: 'token-123' })
    expect(result).toMatchObject({ total: 2, passed: 1, failed: 1 })
    expect(result.tests.map(item => [item.storyId, item.variantId])).toEqual([['first', 'shared'], ['second', 'shared']])
    expect(JSON.stringify(result)).not.toMatch(/private\/project|token-123|password|raw/)
    expect(result.tests[1].errors[0]).toMatchObject({ message: '[project] fail [redacted]' })
  })

  it('bounds one huge case with explicit truncation instead of losing failed count', () => {
    const value = summary()
    value.tests[1].errors = Array.from({ length: 1000 }, () => ({ message: 'x'.repeat(10000), stack: 'y'.repeat(10000) }))
    const result = sanitizeMcpTestSummary(value, { root: '/project' })
    expect(result.failed).toBe(1)
    expect(result.tests[1].errors.at(-1)).toEqual({ message: expect.stringMatching(/^\[truncated oversized test case: \d+ additional errors; state=failed\]$/) })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(128 * 1024)
  })

  it('keeps JSON-escaped control-heavy cases page-sized with explicit truncation', () => {
    const value = summary()
    value.tests[1].errors = Array.from({ length: 4 }, () => ({ message: '\u0001'.repeat(4096), stack: '\u0001'.repeat(4096), diff: '\u0001'.repeat(4096) }))
    const result = sanitizeMcpTestSummary(value, { root: '/project' })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(128 * 1024)
    expect(result.tests[1].errors.at(-1)).toEqual({ message: '[truncated oversized test case: 3 additional errors; state=failed]' })
    expect(result.failed).toBe(1)
  })

  it('rejects full oversized result with bounded aggregate counts', () => {
    const value = summary()
    value.tests = Array.from({ length: 2000 }, () => ({ ...value.tests[1], errors: [{ message: 'x'.repeat(4096) }] }))
    expect(() => sanitizeMcpTestSummary(value, { root: '/project' })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE', details: { total: 2, passed: 1, failed: 1, skipped: 0 } }))
  })
})
