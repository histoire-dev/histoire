import type { HistoireTestCaseResultInput, HistoireTestDefinition, HistoireTestRunSummary } from '@histoire/shared'
import type { VariantSession } from './session.js'
import { createHistoireTestSummary, serializeTestError } from '@histoire/shared'
import { createMissingHandlerError } from './definitions.js'
import { assertSharedExpectState, resetSharedExpectState } from './expect-state.js'

/**
 * The slice of Vitest's worker global the preview runtime drives by hand.
 *
 * Histoire executes collected handlers itself instead of going through Vitest's
 * runner, so it has to publish the "current task" Vitest APIs (`onTestFinished`,
 * `expect` state, locators…) read from the global.
 */
interface VitestWorkerState {
  filepath?: string
  current?: any
}

/** Reads Vitest's worker global, absent when running outside a Vitest runtime. */
function getVitestWorkerState(): VitestWorkerState | undefined {
  return (globalThis as typeof globalThis & { __vitest_worker__?: VitestWorkerState }).__vitest_worker__
}

/**
 * Decides whether a definition must be reported as skipped instead of run.
 * @param definition The collected definition.
 * @param hasFocusedTests True when at least one definition of the variant uses `.only`.
 */
function isSkipped(definition: HistoireTestDefinition, hasFocusedTests: boolean) {
  return definition.mode === 'skip'
    || definition.mode === 'todo'
    || (hasFocusedTests && definition.mode !== 'only')
}

/** Builds the result entry reported for one definition. */
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

/**
 * Runs one test handler, returning the thrown value instead of propagating it.
 * @returns The error thrown by the handler, or `undefined` when it passed.
 */
async function runDefinitionHandler(definition: HistoireTestDefinition, storyId: string, variantId: string) {
  try {
    if (!definition.handler) {
      throw createMissingHandlerError(definition.fullName, storyId, variantId)
    }

    await definition.handler()
  }
  catch (error) {
    return error
  }
}

/**
 * Runs the `onFinished` callbacks registered through the test context.
 *
 * They must run even when the handler threw, so that cleanup hooks still
 * execute; a cleanup failure is only reported when the test itself passed.
 * @param workerState Vitest's worker global, if any.
 * @param testError The error already produced by the handler, if any.
 * @returns The error to report for this test.
 */
async function runOnFinishedCallbacks(workerState: VitestWorkerState | undefined, testError: unknown) {
  let error = testError

  for (const callback of workerState?.current?.onFinished ?? []) {
    try {
      await callback()
    }
    catch (cleanupError) {
      if (!error) {
        error = cleanupError
      }
    }
  }

  return error
}

/**
 * Executes every collected test of a mounted variant session, honouring the
 * `.skip` / `.only` / `.todo` modifiers.
 * @param session The mounted variant session to run.
 * @param storyId Story the variant belongs to, used for ids and error messages.
 * @param variantId Variant being run.
 * @returns The summary reported back to the host UI.
 */
export async function runSessionTests(
  session: VariantSession,
  storyId: string,
  variantId: string,
): Promise<HistoireTestRunSummary> {
  const workerState = getVitestWorkerState()
  const hasFocusedTests = session.definitions.some(definition => definition.mode === 'only')
  const filepath = session.file.story.file?.filePath ?? session.file.filePath
  const results: HistoireTestCaseResultInput[] = []

  for (const [index, definition] of session.definitions.entries()) {
    const previousCurrent = workerState?.current
    const previousFilepath = workerState?.filepath

    if (isSkipped(definition, hasFocusedTests)) {
      results.push(toResult(definition, 'skipped', []))
      continue
    }

    if (workerState) {
      workerState.filepath = filepath
      workerState.current = {
        id: `${storyId}:${variantId}:${index}`,
        type: 'test',
        name: definition.fullName,
        file: {
          filepath,
          name: session.file.story.title,
        },
        onFinished: [],
      }
    }

    // Reset shared expect state so assertion counters and `expect.assertions(n)`
    // expectations from the previous test do not leak into this one.
    resetSharedExpectState()

    let testError = await runDefinitionHandler(definition, storyId, variantId)
    testError = await runOnFinishedCallbacks(workerState, testError)

    if (!testError) {
      try {
        assertSharedExpectState()
      }
      catch (assertionError) {
        testError = assertionError
      }
    }

    results.push(testError
      ? toResult(definition, 'failed', [serializeTestError(testError)])
      : toResult(definition, 'passed', []))

    if (workerState) {
      // Both fields are borrowed from the Vitest worker for the duration of one
      // test: leaving `filepath` pointing at the story would misattribute
      // whatever the harness reports after this run.
      workerState.current = previousCurrent
      workerState.filepath = previousFilepath
    }
  }

  return createHistoireTestSummary(storyId, variantId, results)
}
