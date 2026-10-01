import type { HistoireTestCleanup, HistoireTestDefinition, HistoireTestRuntimeContext } from '@histoire/shared'
import { runAroundHooks } from './around-hooks.js'
import { runHooks } from './hooks.js'
import { runDefinitionWithHooks } from './run-definition.js'
import { finishHistoireTestTask } from './task-callbacks.js'
import { isHistoireTestTask } from './test-task.js'
import { getVitestWorkerState } from './worker-state.js'

/** Runs suite hooks around one isolated CLI test mount. */
export async function runSingleDefinition(definition: HistoireTestDefinition, storyId: string, variantId: string) {
  const scopes = definition.hookScopes ?? []
  const task = getVitestWorkerState()?.current
  let taskFinalized = false

  /** Finalizes callbacks once, including setup failures that skip the test body. */
  async function finishTask(error?: unknown) {
    if (!isHistoireTestTask(task) || taskFinalized) {
      return error
    }
    taskFinalized = true
    return await finishHistoireTestTask(task, error)
  }

  /** Enters one suite, guaranteeing cleanup before leaving its aroundAll wrapper. */
  async function runScope(index: number): Promise<void> {
    const scope = scopes[index]
    if (!scope) {
      await runDefinitionWithHooks(
        definition,
        storyId,
        variantId,
        finishTask,
      )
      return
    }
    await runAroundHooks(scope.aroundAll.map(hook => ({ hook, suite: scope.suite })), async () => {
      const cleanups: HistoireTestCleanup[] = []
      const context = getVitestWorkerState()?.current?.context as HistoireTestRuntimeContext | undefined
      let error = await runHooks(scope.beforeAll, undefined, scope.suite, undefined, false, cleanups)
      if (!error) {
        try {
          await runScope(index + 1)
        }
        catch (innerError) {
          error = innerError
        }
      }
      // A setup failure can bypass the per-test lifecycle completely. Finalize
      // callbacks while this suite and its mount are still available.
      error = (await finishTask(error)) ?? error
      error = await runHooks([...scope.afterAll].reverse(), undefined, scope.suite, error, true)
      error = await runHooks(cleanups.reverse(), context, undefined, error, true)
      if (error) throw error
    }, undefined, 'aroundAll')
  }
  try {
    await runScope(0)
  }
  catch (error) {
    throw (await finishTask(error)) ?? error
  }
}
