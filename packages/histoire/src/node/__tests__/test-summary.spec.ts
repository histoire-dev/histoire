import { HISTOIRE_UNHANDLED_ERROR_NAME, HISTOIRE_VARIANT_ERROR_TEST_NAME } from '@histoire/shared/src/test-results.js'
import { describe, expect, it } from 'vitest'
import { summarizeResults } from '../test/summary.js'

/** Minimal Vitest test module with one test carrying the given meta. */
function module(meta: Record<string, unknown>) {
  const test = { name: 'Accessibility (axe-core)', result: () => ({ state: 'failed', errors: [{ message: 'boom' }] }), meta: () => meta }
  return { moduleId: '/specs/a.spec.ts', children: { allTests: () => [test] } } as any
}

describe('summarizeResults', () => {
  it('maps test data from task meta onto results', () => {
    const summary = summarizeResults([module({ histoireData: { a11y: { count: 2 } } })], [{ path: '/specs/a.spec.ts', storyId: 's', variantId: 'v' }])
    expect(summary.tests[0]).toMatchObject({ storyId: 's', variantId: 'v', state: 'failed', data: { a11y: { count: 2 } } })
  })

  it('drops invalid data', () => {
    const summary = summarizeResults([module({ histoireData: [1] })], [{ path: '/specs/a.spec.ts', storyId: 's', variantId: 'v' }])
    expect(summary.tests[0].data).toBeUndefined()
  })

  it('reports module errors as a failed result of their variant and keeps other results', () => {
    const broken = { moduleId: '/specs/b.spec.ts', errors: () => [{ message: 'Failed to import test file', cause: { message: 'Timed out waiting for "ready"' } }], children: { allTests: () => [] } } as any
    const summary = summarizeResults([module({}), broken], [{ path: '/specs/a.spec.ts', storyId: 's', variantId: 'v' }, { path: '/specs/b.spec.ts', storyId: 's', variantId: 'w' }])
    expect(summary.ok).toBe(false)
    expect(summary.tests.map(test => [test.variantId, test.name, test.state])).toEqual([['v', 'Accessibility (axe-core)', 'failed'], ['w', HISTOIRE_VARIANT_ERROR_TEST_NAME, 'failed']])
    // The cause carries the actual reason of the import failure.
    expect(summary.tests[1].errors[0]).toMatchObject({ message: 'Failed to import test file\nCaused by: Timed out waiting for "ready"' })
  })

  it('attributes unhandled errors to the variant whose spec raised them, else to the run', () => {
    const specs = [{ path: '/specs/a.spec.ts', storyId: 's', variantId: 'v' }]
    const summary = summarizeResults([module({})], specs, [{ message: 'loadAnimation', VITEST_TEST_PATH: '/specs/a.spec.ts' }, { message: 'worker crashed' }])
    expect(summary.ok).toBe(false)
    expect(summary.tests.map(test => [test.variantId, test.name])).toEqual([['v', 'Accessibility (axe-core)'], ['v', HISTOIRE_VARIANT_ERROR_TEST_NAME]])
    expect(summary.tests[1].errors[0].message).toContain('loadAnimation')
    expect(summary.errors.filter(error => error.name === HISTOIRE_UNHANDLED_ERROR_NAME).map(error => error.message)).toEqual([expect.stringContaining('worker crashed')])
  })
})
