import type { HistoireTestCaseResultInput, HistoireTestCleanup, HistoireTestDefinition, HistoireTestHookScope, HistoireTestRunSummary } from '@histoire/shared'
import type { OpenAroundHooks } from './around-hooks.js'
import type { VariantSession } from './session.js'
import { createHistoireTestSummary, serializeTestError } from '@histoire/shared'
import { openAroundHooks } from './around-hooks.js'
import { resetSharedExpectState } from './expect-state.js'
import { runHooks } from './hooks.js'
import { runDefinitionWithHooks } from './run-definition.js'

import { finishHistoireTestTask } from './task-callbacks.js'
import { createPreviewTestTask } from './test-task.js'
import { getVitestWorkerState } from './worker-state.js'

/** Decides whether a definition must be reported as skipped. */
function isSkipped(definition: HistoireTestDefinition, hasFocusedTests: boolean) {
  return definition.mode === 'skip'
    || definition.mode === 'todo'
    || (hasFocusedTests && definition.mode !== 'only')
}

/** Builds one result entry reported to Histoire. */
function toResult(
  definition: HistoireTestDefinition,
  state: HistoireTestCaseResultInput['state'],
  errors: HistoireTestCaseResultInput['errors'],
): HistoireTestCaseResultInput {
  return {
    id: definition.id,
    name: definition.name,
    fullName: definition.fullName,
    state,
    errors,
  }
}

/** Returns count of identical leading suite scopes. */
function commonScopeCount(left: HistoireTestHookScope[], right: HistoireTestHookScope[]) {
  let count = 0
  while (left[count] && left[count] === right[count]) {
    count++
  }
  return count
}

/** Marks an already-created result failed because suite cleanup failed. */
function appendResultError(result: HistoireTestCaseResultInput | undefined, error: unknown) {
  if (!result || !error) {
    return
  }
  result.state = 'failed'
  result.errors.push(serializeTestError(error))
}

/** Executes all collected tests of one mounted variant session. */
export async function runSessionTests(
  session: VariantSession,
  storyId: string,
  variantId: string,
): Promise<HistoireTestRunSummary> {
  const workerState = getVitestWorkerState()
  const hasFocusedTests = session.definitions.some(definition => definition.mode === 'only')
  const filepath = session.file.story.file?.filePath ?? session.file.filePath
  const results: HistoireTestCaseResultInput[] = []
  const scopeErrors = new Map<HistoireTestHookScope, unknown>()
  const unopenedScopeErrors = new Map<HistoireTestHookScope, unknown>()
  const suiteCleanups = new Map<HistoireTestHookScope, HistoireTestCleanup[]>()
  const aroundControllers = new Map<HistoireTestHookScope, OpenAroundHooks>()
  let activeScopes: HistoireTestHookScope[] = []
  let lastRunnableResult: HistoireTestCaseResultInput | undefined

  /** Unwinds a completed suite, including setup disposers and its aroundAll wrapper. */
  async function closeScope(scope: HistoireTestHookScope, error?: unknown) {
    error = await runHooks([...scope.afterAll].reverse(), undefined, scope.suite, error, true)
    error = await runHooks((suiteCleanups.get(scope) ?? []).reverse(), undefined, undefined, error, true)
    const aroundError = await aroundControllers.get(scope)?.close()
    suiteCleanups.delete(scope)
    aroundControllers.delete(scope)
    scopeErrors.delete(scope)
    return error ?? aroundError
  }

  for (const [index, definition] of session.definitions.entries()) {
    if (isSkipped(definition, hasFocusedTests)) {
      results.push(toResult(definition, 'skipped', []))
      continue
    }

    const nextScopes = definition.hookScopes ?? []
    const sharedCount = commonScopeCount(activeScopes, nextScopes)
    let transitionError: unknown
    for (const scope of activeScopes.slice(sharedCount).reverse()) {
      transitionError = await closeScope(scope, transitionError)
    }
    appendResultError(lastRunnableResult, transitionError)
    activeScopes = activeScopes.slice(0, sharedCount)

    // A failed ancestor prevents Vitest from entering descendant suites. Keep
    // `activeScopes` to scopes that actually opened so their teardown runs,
    // while never calling child beforeAll/afterAll hooks that were skipped.
    let blockedByAncestor = activeScopes.some(scope => scopeErrors.has(scope))
    for (const scope of nextScopes.slice(sharedCount)) {
      if (blockedByAncestor || unopenedScopeErrors.has(scope)) {
        blockedByAncestor = true
        break
      }
      let openingError: unknown
      if (scope.aroundAll.length) {
        const opened = await openAroundHooks(scope.aroundAll, scope.suite)
        if ('controller' in opened) {
          aroundControllers.set(scope, opened.controller)
        }
        else {
          openingError = opened.error
        }
      }
      if (openingError) {
        // Vitest never enters a suite whose aroundAll setup failed, so neither
        // afterAll nor beforeAll disposers may run for this scope.
        unopenedScopeErrors.set(scope, openingError)
        blockedByAncestor = true
        break
      }
      const cleanups: HistoireTestCleanup[] = []
      suiteCleanups.set(scope, cleanups)
      const error = await runHooks(scope.beforeAll, undefined, scope.suite, undefined, false, cleanups)
      activeScopes.push(scope)
      if (error) {
        scopeErrors.set(scope, error)
        blockedByAncestor = true
      }
    }

    const previousCurrent = workerState?.current
    const previousFilepath = workerState?.filepath
    const task = createPreviewTestTask(definition, `${storyId}:${variantId}:${index}`, filepath)
    if (workerState) {
      workerState.filepath = filepath
      workerState.current = task
    }

    try {
      resetSharedExpectState()
      let taskFinalized = false
      let testError = nextScopes.map(scope => scopeErrors.get(scope) ?? unopenedScopeErrors.get(scope)).find(Boolean)
      if (!testError) {
        try {
          await runDefinitionWithHooks(definition, storyId, variantId, async (error) => {
            taskFinalized = true
            return await finishHistoireTestTask(task, error)
          })
        }
        catch (error) {
          testError = error
        }
      }
      // A failed aroundEach setup may never call the inner lifecycle, so its
      // callbacks have not finalized the task yet. Finalize it here exactly
      // once; otherwise callbacks have already run before wrapper teardown.
      if (!taskFinalized) {
        await finishHistoireTestTask(task, testError)
      }
      else if (testError) {
        const errors = testError instanceof AggregateError ? testError.errors : [testError]
        for (const error of errors) {
          if (!task.result.errors.includes(error)) task.result.errors.push(error)
        }
        task.result.state = 'fail'
      }
      const errors = task.result.errors
      lastRunnableResult = toResult(definition, errors.length ? 'failed' : 'passed', errors.map(serializeTestError))
      results.push(lastRunnableResult)
    }
    finally {
      if (workerState) {
        workerState.current = previousCurrent
        workerState.filepath = previousFilepath
      }
    }
  }

  let finalError: unknown
  for (const scope of [...activeScopes].reverse()) {
    finalError = await closeScope(scope, finalError)
  }
  appendResultError(lastRunnableResult, finalError)

  return createHistoireTestSummary(storyId, variantId, results)
}
