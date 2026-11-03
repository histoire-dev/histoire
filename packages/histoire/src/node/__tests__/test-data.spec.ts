import { HISTOIRE_TEST_DATA_LIMIT } from '@histoire/protocol'
import { readHistoireTestData, setHistoireTestData } from '@histoire/shared/src/test-data.js'
import { createHistoireTestSummary } from '@histoire/shared/src/test-results.js'
import { describe, expect, it, vi } from 'vitest'

describe('test data', () => {
  it('merges plugin keys into the task meta and reads them back', () => {
    const task = { meta: {} as Record<string, unknown> }
    expect(setHistoireTestData({ task }, 'a11y', { count: 1 })).toBe(true)
    expect(setHistoireTestData({ task }, 'other', [1])).toBe(true)
    expect(readHistoireTestData(task.meta)).toEqual({ a11y: { count: 1 }, other: [1] })
  })

  it('ignores missing tasks and drops oversized data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const task = { meta: {} as Record<string, unknown> }
    expect(setHistoireTestData(undefined, 'a11y', 1)).toBe(false)
    expect(setHistoireTestData({ task: {} }, 'a11y', 1)).toBe(false)
    expect(setHistoireTestData({ task }, 'a11y', 'x'.repeat(HISTOIRE_TEST_DATA_LIMIT))).toBe(false)
    expect(readHistoireTestData(task.meta)).toBeUndefined()
    expect(readHistoireTestData({ histoireData: [1] })).toBeUndefined()
    warn.mockRestore()
  })

  it('keeps data in run summaries', () => {
    const summary = createHistoireTestSummary('s', 'v', [{ name: 'a', state: 'passed', errors: [], data: { a11y: 1 } }])
    expect(summary.tests[0].data).toEqual({ a11y: 1 })
  })
})
