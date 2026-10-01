import type { HistoireTestAroundHookEntry, HistoireTestRuntimeContext, HistoireTestSuiteContext } from '@histoire/shared'
import { getHookTimeout, withTimeout } from './timeouts.js'

/** Around hook together with suite metadata Vitest passes to it. */
export interface RuntimeAroundHook {
  /** Collected wrapper and its per-phase deadline. */
  hook: HistoireTestAroundHookEntry
  /** Suite owning this wrapper. */
  suite: HistoireTestSuiteContext
}

/** Active suite wrapper waiting for lifecycle completion. */
export interface OpenAroundHooks {
  /** Releases wrapper teardown and returns its error, if any. */
  close: () => Promise<unknown>
}

/** Builds Vitest's around-hook phase timeout error. */
function createAroundHookTimeoutError(name: 'aroundAll' | 'aroundEach', phase: 'setup' | 'teardown', timeout: number) {
  return new Error(`The ${phase} phase of "${name}" hook timed out after ${timeout}ms.`)
}

/**
 * Composes Vitest 4.1 around hooks with separate setup and teardown deadlines.
 * A wrapper that resumes after setup timed out cannot enter later test work.
 */
export async function runAroundHooks(
  hooks: RuntimeAroundHook[],
  runInner: () => Promise<void>,
  context?: HistoireTestRuntimeContext,
  hookName: 'aroundAll' | 'aroundEach' = 'aroundEach',
) {
  let error: unknown

  /** Retains first failure without blocking outer wrapper teardown. */
  function captureError(nextError: unknown) {
    error ??= nextError
  }

  /** Runs one wrapper and then its nested wrapper. */
  async function dispatch(index: number): Promise<void> {
    const entry = hooks[index]
    if (!entry) {
      try {
        await runInner()
      }
      catch (innerError) {
        captureError(innerError)
      }
      return
    }

    const timeout = getHookTimeout(entry.hook.timeout)
    let allowRun = true
    let calls = 0
    let innerPromise: Promise<void> | undefined
    let markRunCalled!: () => void
    const runCalled = new Promise<void>((resolve) => {
      markRunCalled = resolve
    })
    const run = async () => {
      if (!allowRun) return
      calls++
      if (calls > 1) {
        captureError(new Error('Vitest around hook callback can only be called once.'))
        return
      }
      markRunCalled()
      innerPromise = dispatch(index + 1)
      await innerPromise
    }
    const hookPromise = Promise.resolve().then(() => entry.hook.handler(run, context ?? {}, entry.suite))
    const setup = Promise.race([
      runCalled,
      hookPromise.then(() => {
        if (!calls) {
          throw new Error('Vitest around hook did not call its run callback.')
        }
      }),
    ])

    try {
      await withTimeout(setup, timeout, () => createAroundHookTimeoutError(hookName, 'setup', timeout))
    }
    catch (hookError) {
      allowRun = false
      captureError(hookError)
      return
    }

    // Even wrappers that forget `await runTest()` keep nested work alive until
    // its own hooks and test callbacks have completed.
    await innerPromise
    try {
      await withTimeout(hookPromise, timeout, () => createAroundHookTimeoutError(hookName, 'teardown', timeout))
    }
    catch (hookError) {
      captureError(hookError)
    }
  }

  await dispatch(0)
  if (error) throw error
}

/** Opens suite around hooks until their `runSuite` callback is reached. */
export async function openAroundHooks(hooks: HistoireTestAroundHookEntry[], suite: HistoireTestSuiteContext) {
  let release!: () => void
  let entered!: () => void
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve
  })
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve
  })
  const outcome = runAroundHooks(hooks.map(hook => ({ hook, suite })), async () => {
    entered()
    await releasePromise
  }, undefined, 'aroundAll').then(() => undefined, error => error)

  const openingError = await Promise.race([
    enteredPromise.then(() => undefined),
    outcome,
  ])
  if (openingError) {
    return { error: openingError }
  }

  return {
    controller: {
      async close() {
        release()
        return await outcome
      },
    } satisfies OpenAroundHooks,
  }
}
