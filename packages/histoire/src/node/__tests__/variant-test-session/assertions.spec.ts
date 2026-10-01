import { describe, expect, it, vi } from 'vitest'
import { afterEach as collectAfterEach, it as collectIt } from '../../vendors/vitest-collect.js'
import { createSessionOptions, runStorySetup, STORY_ID, useVariantTestSession, VARIANT_ID } from '../utils/variant-test-session.js'

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

describe('createVariantTestSession assertion state', () => {
  const runtime = useVariantTestSession()

  it('resets shared expect state between consecutive test handlers', async () => {
    await withFakeExpectState(async (sharedExpectState) => {
      const observedAssertionCalls: number[] = []
      runStorySetup(runtime.mounts.renderRegistrations, ({ canvas }) => {
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

      const session = runtime.createVariantTestSession(createSessionOptions({
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
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectIt('requires one assertion', () => {
          sharedExpectState.expectedAssertionsNumber = 1
          sharedExpectState.expectedAssertionsNumberErrorGen = () => new Error('expected one assertion')
        })
      })

      const session = runtime.createVariantTestSession(createSessionOptions({
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
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectIt('requires any assertion', () => {
          sharedExpectState.isExpectingAssertions = true
          sharedExpectState.isExpectingAssertionsError = new Error('expected any assertion')
        })
      })

      const session = runtime.createVariantTestSession(createSessionOptions({
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

  it('clears context-local assertion expectations before afterEach', async () => {
    let task: any
    const localState = {
      assertionCalls: 0,
      expectedAssertionsNumber: null as number | null,
      expectedAssertionsNumberErrorGen: null as (() => Error) | null,
      isExpectingAssertions: false,
      isExpectingAssertionsError: null as Error | null,
    }
    const localExpect = {
      getState: () => localState,
      setState: (state: Partial<typeof localState>) => Object.assign(localState, state),
    }
    const previousWorker = (globalThis as any).__vitest_worker__
    ;(globalThis as any).__vitest_worker__ = {
      get current() {
        return task
      },
    }

    try {
      runStorySetup(runtime.mounts.renderRegistrations, () => {
        collectAfterEach(() => {
          localState.assertionCalls++
        })
        collectIt('uses context expect', ({ expect }) => {
          expect.setState({
            assertionCalls: 1,
            expectedAssertionsNumber: 1,
            expectedAssertionsNumberErrorGen: () => new Error('local assertion count failed'),
          })
        })
      })
      const session = runtime.createVariantTestSession(createSessionOptions())
      const [definition] = await session.collectVariantTests(STORY_ID, VARIANT_ID)
      task = {
        context: { _local: true, expect: localExpect },
        onFailed: [],
        onFinished: [],
        promises: [],
        result: { state: 'run', errors: [] },
      }
      task.context.task = task

      await session.runCollectedTest(STORY_ID, VARIANT_ID, definition)

      expect(localState.assertionCalls).toBe(2)
      expect(localState.expectedAssertionsNumber).toBeNull()
      expect(localState.expectedAssertionsNumberErrorGen).toBeNull()
    }
    finally {
      ;(globalThis as any).__vitest_worker__ = previousWorker
    }
  })
})
