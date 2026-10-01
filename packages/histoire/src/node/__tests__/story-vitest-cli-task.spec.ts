import { collectHistoireTests } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { runSingleDefinition } from '../virtual/variant-test-session/run-single-definition.js'
import { enterHistoireTestTask } from '../virtual/variant-test-session/test-task.js'
import { loadStoryVitestShim } from './utils/story-vitest-shim.js'

describe('cli Vitest task lifecycle', () => {
  it('exposes hard body errors to failure callbacks', async () => {
    const shim = await loadStoryVitestShim()
    let observedErrors: unknown
    const definitions = collectHistoireTests([() => {
      shim.it('body failure', () => {
        shim.onTestFailed(({ task }) => {
          observedErrors = task.result.errors
        })
        throw new Error('body failed')
      })
    }], {} as any)
    const worker = (globalThis as any).__vitest_worker__
    const previousTask = worker.current
    const task = { context: {} as any, result: { state: 'run' }, promises: [] as Promise<unknown>[] }
    task.context.task = task
    worker.current = task
    const leaveTask = enterHistoireTestTask(task)

    try {
      await expect(runSingleDefinition(definitions[0], 'story', 'variant')).rejects.toThrow('body failed')
    }
    finally {
      leaveTask()
      worker.current = previousTask
    }

    expect(observedErrors).toEqual([expect.objectContaining({ message: 'body failed' })])
    expect(task.result.errors).toEqual([])
  })
})
