import { describe, expect, it } from 'vitest'
import { HISTOIRE_TEST_DATA_LIMIT } from '../bridge/limits.js'
import { validateHistoireTestResult } from '../bridge/results.js'

/** Summary of one passed test carrying plugin data. */
function summary(data: unknown) {
  return { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [{ id: '0', name: 'a11y', fullName: 'a11y', state: 'passed', errors: [], data }] }
}

describe('test result data validation', () => {
  it('accepts plugin-keyed JSON data', () => {
    expect(() => validateHistoireTestResult(summary({ a11y: { report: { violations: [], count: 0 } } }), true)).not.toThrow()
    expect(() => validateHistoireTestResult({ ...summary(undefined), tests: [{ id: '0', name: 'a', fullName: 'a', state: 'passed', errors: [] }] }, true)).not.toThrow()
  })

  it('rejects non-record, non-JSON and oversized data', () => {
    expect(() => validateHistoireTestResult(summary([1]), true)).toThrow()
    expect(() => validateHistoireTestResult(summary({ a11y: () => {} }), true)).toThrow()
    expect(() => validateHistoireTestResult(summary({ a11y: 'x'.repeat(HISTOIRE_TEST_DATA_LIMIT) }), true)).toThrow()
  })
})
