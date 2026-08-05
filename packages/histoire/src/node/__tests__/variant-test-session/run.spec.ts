import type { HistoireTestRegistration } from '@histoire/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { it as collectIt } from '../../vendors/vitest-collect.js'
import {
  createSessionOptions,
  createVariantMountMocks,
  runStorySetup,
  STORY_ID,
  VARIANT_ID,
} from '../utils/variant-test-session.js'

/** Key Vitest stores the shared `expect` global under. */
const EXPECT_KEY = Symbol.for('expect-global')

interface SharedExpectState {
  assertionCalls: number
  isExpectingAssertions: boolean
  isExpectingAssertionsError: Error | null
  expectedAssertionsNumber: number | null
  expectedAssertionsNumberErrorGen: (() => Error) | null
}

/**
 * Installs a minimal stand-in for Vitest's shared `expect` global and restores
 * the real one afterwards, so the run path's assertion bookkeeping can be
 * observed without a real Vitest task.
 * @param run Receives the mutable state the fake `expect` exposes.
 */
async function withFakeExpectState(run: (state: SharedExpectState) => Promise<void>) {
  const state: SharedExpectState = {
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
  }
  const previous = (globalThis as any)[EXPECT_KEY]
  ;(globalThis as any)[EXPECT_KEY] = {
    setState(next: Partial<SharedExpectState>) {
      Object.assign(state, next)
    },
    getState: () => state,
  }

  try {
    await run(state)
  }
  finally {
    ;(globalThis as any)[EXPECT_KEY] = previous
  }
}

describe('createVariantTestSession run', () => {
  let createVariantTestSession: typeof import('../../virtual/variant-test-session/index.js').createVariantTestSession
  let mounts: ReturnType<typeof createVariantMountMocks>

  beforeEach(async () => {
    vi.resetModules()
    mounts = createVariantMountMocks()
    vi.doMock('../../virtual/variant-test-mount.js', mounts.moduleFactory)
    ;({ createVariantTestSession } = await import('../../virtual/variant-test-session/index.js'))
  })

  it('keeps the render mount handler when both mounts register the same test', async () => {
    // Both mounts run the story setup, so each produces its own closure over
    // that mount's scope. The collection context (`canvas`) belongs to the
    // render mount, so the surviving handler must be the render one — the
    // bootstrap mount never rendered the variant.
    const executed: string[] = []

    /**
     * Builds a registration whose test handler has identical source in both
     * mounts (only the captured mount name differs), matching what a story
     * `<script setup>` produces when it is mounted twice.
     */
    function createMountRegistration(mount: string): HistoireTestRegistration {
      return () => {
        collectIt('reads mount state', () => {
          executed.push(mount)
        })
      }
    }

    runStorySetup(mounts.bootstrapRegistrations, createMountRegistration('bootstrap'))
    runStorySetup(mounts.renderRegistrations, createMountRegistration('render'))

    const session = createVariantTestSession(createSessionOptions())

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.passed).toBe(1)
    expect(executed).toEqual(['render'])
  })

  it('resets shared expect state between consecutive test handlers', async () => {
    await withFakeExpectState(async (sharedExpectState) => {
      const observedAssertionCalls: number[] = []
      runStorySetup(mounts.renderRegistrations, ({ canvas }) => {
        collectIt('first test', () => {
          observedAssertionCalls.push(sharedExpectState.assertionCalls)
          // Simulate the user calling `expect(value)` which would bump the counter.
          sharedExpectState.assertionCalls += 5
          expect(canvas.textContent).toContain('cache invalidation')
        })

        collectIt('second test', () => {
          observedAssertionCalls.push(sharedExpectState.assertionCalls)
          expect(canvas.textContent).toContain('cache invalidation')
        })
      })

      const session = createVariantTestSession(createSessionOptions({
        moduleLoaders: {
          [STORY_ID]: vi.fn(async () => ({ default: { name: 'ExpectStateComponent' } })),
        },
      }))

      const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

      expect(summary.passed).toBe(2)
      // The second test must observe a freshly reset assertion counter, even
      // though the first test bumped it before completing.
      expect(observedAssertionCalls).toEqual([0, 0])
    })
  })

  it('fails tests when expect.assertions count is not satisfied', async () => {
    await withFakeExpectState(async (sharedExpectState) => {
      runStorySetup(mounts.renderRegistrations, () => {
        collectIt('requires one assertion', () => {
          sharedExpectState.expectedAssertionsNumber = 1
          sharedExpectState.expectedAssertionsNumberErrorGen = () => new Error('expected one assertion')
        })
      })

      const session = createVariantTestSession(createSessionOptions({
        moduleLoaders: {
          [STORY_ID]: vi.fn(async () => ({ default: { name: 'AssertionCountComponent' } })),
        },
      }))

      const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

      expect(summary.failed).toBe(1)
      expect(summary.errors[0]).toMatchObject({
        message: 'expected one assertion',
      })
    })
  })

  it('fails tests when expect.hasAssertions receives no assertions', async () => {
    await withFakeExpectState(async (sharedExpectState) => {
      runStorySetup(mounts.renderRegistrations, () => {
        collectIt('requires any assertion', () => {
          sharedExpectState.isExpectingAssertions = true
          sharedExpectState.isExpectingAssertionsError = new Error('expected any assertion')
        })
      })

      const session = createVariantTestSession(createSessionOptions({
        moduleLoaders: {
          [STORY_ID]: vi.fn(async () => ({ default: { name: 'HasAssertionsComponent' } })),
        },
      }))

      const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

      expect(summary.failed).toBe(1)
      expect(summary.errors[0]).toMatchObject({
        message: 'expected any assertion',
      })
    })
  })

  it('reports skipped collected tests without running their handlers', async () => {
    runStorySetup(mounts.renderRegistrations, () => {
      collectIt.skip('skips this test', () => {
        throw new Error('Skipped test should not run')
      })
    })

    const session = createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'SkippedComponent' } })),
      },
    }))

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.skipped).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.tests[0].state).toBe('skipped')
  })

  it('runs only focused collected tests when an only modifier is present', async () => {
    const executed: string[] = []
    runStorySetup(mounts.renderRegistrations, () => {
      collectIt('unfocused test', () => {
        throw new Error('Unfocused test should not run')
      })

      collectIt.only('focused test', () => {
        executed.push('focused')
      })

      collectIt.todo('future test')
    })

    const session = createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'OnlyComponent' } })),
      },
    }))

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(executed).toEqual(['focused'])
    expect(summary.passed).toBe(1)
    expect(summary.skipped).toBe(2)
    expect(summary.tests.map(test => test.state)).toEqual(['skipped', 'passed', 'skipped'])
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
      runStorySetup(mounts.renderRegistrations, () => {
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

      const session = createVariantTestSession(createSessionOptions({
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
