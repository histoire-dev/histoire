import { describe, expect, it, vi } from 'vitest'
import { runStoryVitestTests } from './utils/story-vitest-shim.js'

describe('emitted Vitest expect facade', () => {
  it('runs valid soft assertions and reports every soft failure without stopping the body', async () => {
    const finished = vi.fn()
    const failed = vi.fn()
    const continued = vi.fn()
    const summary = await runStoryVitestTests((shim) => {
      shim.it('passes', () => shim.expect.soft(1).toBe(1))
      shim.it('fails softly', async () => {
        shim.onTestFailed(failed)
        shim.onTestFinished(finished)
        shim.expect.soft(1).toBe(2)
        await shim.expect.soft(Promise.resolve('actual')).resolves.toBe('expected')
        continued()
      })
      shim.it('next test', () => shim.expect.soft(true).toBe(true))
    })
    expect(summary.tests.map(test => test.state)).toEqual(['passed', 'failed', 'passed'])
    expect(summary.tests[1].errors).toHaveLength(2)
    expect(summary.tests[1].errors[0]).toMatchObject({ message: expect.stringContaining('expected 1 to be 2') })
    expect(continued).toHaveBeenCalledOnce()
    expect(failed).toHaveBeenCalledOnce()
    expect(finished).toHaveBeenCalledOnce()
  })
})
