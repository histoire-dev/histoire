import type { HistoireTestCleanup, HistoireTestDefinition, HistoireTestRuntimeContext } from '@histoire/shared'
import { runAroundHooks } from './around-hooks.js'
import { createMissingHandlerError } from './definitions.js'
import { assertAndClearSharedExpectState } from './expect-state.js'
import { runHooks } from './hooks.js'
import { discardTestPromises, settleTestPromises } from './task-promises.js'
import { isHistoireTestTask } from './test-task.js'
import { createTestTimeoutError, getTestTimeout, withTimeout } from './timeouts.js'
import { getVitestWorkerState } from './worker-state.js'

/** Executes a test body, retaining a setup error instead of running the handler. */
async function runHandler(
  definition: HistoireTestDefinition,
  storyId: string,
  variantId: string,
  context: HistoireTestRuntimeContext | undefined,
  task: any,
  callerPromises: Set<Promise<unknown>>,
  error?: unknown,
) {
  if (error) return error
  try {
    if (!definition.handler) throw createMissingHandlerError(definition.fullName, storyId, variantId)
    const timeout = getTestTimeout(definition.timeout)
    await withTimeout(
      Promise.resolve().then(async () => {
        await definition.handler!(context!)
        const pendingErrors = await settleTestPromises(task, callerPromises)
        if (pendingErrors.length) {
          throw pendingErrors.length === 1
            ? pendingErrors[0]
            : new AggregateError(pendingErrors, 'Pending assertions failed')
        }
      }),
      timeout,
      () => createTestTimeoutError(timeout),
    )
  }
  catch (handlerError) {
    discardTestPromises(task, callerPromises)
    return handlerError
  }
}

/** Runs the shared per-test lifecycle, including disposers from successful setup hooks. */
export async function runDefinitionWithHooks(
  definition: HistoireTestDefinition,
  storyId: string,
  variantId: string,
  finish?: (error?: unknown) => Promise<unknown>,
) {
  const scopes = definition.hookScopes ?? []
  const task = getVitestWorkerState()?.current
  const context = task?.context as HistoireTestRuntimeContext | undefined
  const callerPromises = new Set<Promise<unknown>>(task?.promises ?? [])
  await runAroundHooks(scopes.flatMap(scope => scope.aroundEach.map(hook => ({ hook, suite: scope.suite }))), async () => {
    const cleanups: HistoireTestCleanup[] = []
    let error: unknown
    for (const scope of scopes) {
      error = await runHooks(scope.beforeEach, context, scope.suite, error, false, cleanups)
    }
    error = await runHandler(definition, storyId, variantId, context, task, callerPromises, error)
    if (!error && isHistoireTestTask(task)) {
      try {
        assertAndClearSharedExpectState(context)
      }
      catch (assertionError) {
        error = assertionError
      }
    }
    for (const scope of [...scopes].reverse()) {
      error = await runHooks([...scope.afterEach].reverse(), context, scope.suite, error, true)
    }
    // All explicit afterEach hooks precede returned disposers; acquired resources
    // unwind in reverse order even if a later setup, test, or teardown failed.
    error = await runHooks(cleanups.reverse(), context, undefined, error, true)
    error = (await finish?.(error)) ?? error
    if (error) throw error
  }, context)
}
