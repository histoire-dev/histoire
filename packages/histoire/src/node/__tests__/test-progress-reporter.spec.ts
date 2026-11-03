import { describe, expect, it, vi } from 'vitest'
import { progressReporterOptions } from '../test/progress-reporter.js'

describe('test run progress reporter', () => {
  it('keeps configured reporters and counts finished variant specs per attempt', () => {
    const onProgress = vi.fn()
    const { reporters } = progressReporterOptions(['dot'], 2, onProgress) as { reporters: any[] }
    expect(reporters[0]).toBe('dot')
    const reporter = reporters[1]
    reporter.onTestRunStart()
    reporter.onTestModuleEnd()
    reporter.onTestModuleEnd()
    reporter.onTestModuleEnd()
    // A retried attempt starts counting again.
    reporter.onTestRunStart()
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([{ completed: 0, total: 2 }, { completed: 1, total: 2 }, { completed: 2, total: 2 }, { completed: 2, total: 2 }, { completed: 0, total: 2 }])
  })

  it('adds the default reporter and leaves runs without listener untouched', () => {
    expect((progressReporterOptions(undefined, 1, () => {}).reporters as any[])[0]).toBe('default')
    // An explicit `reporters: undefined` crashes Vitest config resolution.
    expect(progressReporterOptions(undefined, 1)).toEqual({})
  })
})
