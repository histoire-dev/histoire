import { describe, expect, it, vi } from 'vitest'
import { afterAll as collectAfterAll, aroundAll as collectAroundAll, aroundEach as collectAroundEach, it as collectIt } from '../../vendors/vitest-collect.js'
import { createSessionOptions, runStorySetup, STORY_ID, useVariantTestSession, VARIANT_ID } from '../utils/variant-test-session.js'

describe('createVariantTestSession task callbacks', () => {
  const runtime = useVariantTestSession()

  it('runs CLI callbacks before releasing story lifecycle resources', async () => {
    let task: any
    const order: string[] = []
    const previousWorker = (globalThis as any).__vitest_worker__
    ;(globalThis as any).__vitest_worker__ = {
      get current() {
        return task
      },
    }

    try {
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectAroundAll(async (runSuite) => {
          order.push('aroundAll setup')
          await runSuite()
          order.push('aroundAll teardown')
        })
        collectAroundEach(async (runTest) => {
          order.push('aroundEach setup')
          await runTest()
          order.push('aroundEach teardown')
        })
        collectAfterAll(() => order.push('afterAll'))
        collectIt('callback can use the mounted story', () => {
          task?.onFinished.push(() => {
            expect(runtime.mounts.cleanups.render).toBe(1)
            expect(task.result.state).toBe('fail')
            order.push('finished')
          })
          task?.onFailed.push(() => {
            expect(runtime.mounts.cleanups.render).toBe(1)
            order.push('failed')
          })
          throw new Error('test failed')
        })
      })
      const session = runtime.createVariantTestSession(createSessionOptions())
      const [definition] = await session.collectVariantTests(STORY_ID, VARIANT_ID)
      task = {
        context: {},
        onFailed: [],
        onFinished: [],
        promises: [],
        result: { state: 'run' },
      }
      task.context.task = task

      await expect(session.runCollectedTest(STORY_ID, VARIANT_ID, definition)).rejects.toThrow('test failed')

      expect(order).toEqual([
        'aroundAll setup',
        'aroundEach setup',
        'finished',
        'failed',
        'aroundEach teardown',
        'afterAll',
        'aroundAll teardown',
      ])
      expect(runtime.mounts.cleanups).toEqual({ bootstrap: 2, render: 2 })
      expect(task.onFinished).toBeUndefined()
      expect(task.onFailed).toBeUndefined()
    }
    finally {
      ;(globalThis as any).__vitest_worker__ = previousWorker
    }
  })

  it('runs CLI callbacks before cleanup when aroundEach setup fails', async () => {
    let task: any
    const order: string[] = []
    const previousWorker = (globalThis as any).__vitest_worker__
    ;(globalThis as any).__vitest_worker__ = {
      get current() {
        return task
      },
    }

    try {
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectAroundEach(async () => {
          task?.onFinished.push(() => {
            expect(runtime.mounts.cleanups.render).toBe(1)
            order.push('finished')
          })
          task?.onFailed.push(() => {
            expect(runtime.mounts.cleanups.render).toBe(1)
            order.push('failed')
          })
          throw new Error('wrapper setup failed')
        })
        collectIt('case', () => {
          throw new Error('test body must not run')
        })
      })
      const session = runtime.createVariantTestSession(createSessionOptions())
      const [definition] = await session.collectVariantTests(STORY_ID, VARIANT_ID)
      task = {
        context: {},
        onFailed: [],
        onFinished: [],
        promises: [],
        result: { state: 'run', errors: [] },
      }
      task.context.task = task

      await expect(session.runCollectedTest(STORY_ID, VARIANT_ID, definition)).rejects.toThrow('wrapper setup failed')

      expect(order).toEqual(['finished', 'failed'])
      expect(task.onFinished).toBeUndefined()
      expect(task.onFailed).toBeUndefined()
      expect(runtime.mounts.cleanups).toEqual({ bootstrap: 2, render: 2 })
    }
    finally {
      ;(globalThis as any).__vitest_worker__ = previousWorker
    }
  })

  it('runs onFinished callbacks even when a test handler throws', async () => {
    const cleanupOrder: string[] = []
    let activeTask: any = null
    const previousWorker = (globalThis as any).__vitest_worker__
    ;(globalThis as any).__vitest_worker__ = {
      get current() {
        return activeTask
      },
      set current(value: any) {
        activeTask = value
      },
    }

    try {
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectIt('failing test that registers cleanup', async () => {
          activeTask?.onFinished?.push(async () => {
            cleanupOrder.push('failing-cleanup')
          })
          throw new Error('boom')
        })

        collectIt('passing test that registers cleanup', async () => {
          activeTask?.onFinished?.push(async () => {
            cleanupOrder.push('passing-cleanup')
          })
        })
      })

      const session = runtime.createVariantTestSession(createSessionOptions({
        moduleLoaders: {
          [STORY_ID]: vi.fn(async () => ({ default: { name: 'OnFinishedComponent' } })),
        },
      }))

      const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

      expect(summary.passed).toBe(1)
      expect(summary.failed).toBe(1)
      // Both cleanups must run regardless of test outcome.
      expect(cleanupOrder).toEqual(['failing-cleanup', 'passing-cleanup'])
    }
    finally {
      ;(globalThis as any).__vitest_worker__ = previousWorker
    }
  })
})
