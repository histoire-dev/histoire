import type { HistoireSerializedTestDefinition, HistoireTestCaseResultInput } from '@histoire/shared'
import type { VariantSession } from './session.js'
import { createHistoireTestSummary, serializeTestError } from '@histoire/shared'
import { createMissingHandlerError, getMatchingDefinition } from './definitions.js'
import { resetSharedExpectState } from './expect-state.js'
import { runSingleDefinition } from './run-single-definition.js'
import { createPreviewTestTask } from './test-task.js'
import { getVitestWorkerState } from './worker-state.js'

/** Decides whether a definition must be reported without executing its body. */
function isSkipped(definition: { mode?: string }, hasFocusedTests: boolean) {
  return definition.mode === 'skip'
    || definition.mode === 'todo'
    || (hasFocusedTests && definition.mode !== 'only')
}

/** Builds the portable result returned from one hidden runtime document. */
function toResult(
  definition: HistoireSerializedTestDefinition,
  state: HistoireTestCaseResultInput['state'],
  errors: HistoireTestCaseResultInput['errors'],
): HistoireTestCaseResultInput {
  return { id: definition.id, name: definition.name, fullName: definition.fullName, state, errors }
}

/**
 * Runs one collected definition in a fresh mounted session.
 *
 * Every hidden document owns one of these sessions. This intentionally runs
 * suite-level hooks for each case, matching generated Vitest browser specs.
 */
export async function runPreviewDefinition(
  session: VariantSession,
  storyId: string,
  variantId: string,
  serialized: HistoireSerializedTestDefinition,
) {
  const definition = getMatchingDefinition(session.definitions, serialized)
  if (!definition) {
    return createHistoireTestSummary(storyId, variantId, [toResult(
      serialized,
      'failed',
      [serializeTestError(createMissingHandlerError(serialized.fullName, storyId, variantId))],
    )])
  }

  if (isSkipped(definition, session.definitions.some(item => item.mode === 'only'))) {
    return createHistoireTestSummary(storyId, variantId, [toResult(definition, 'skipped', [])])
  }

  const workerState = getVitestWorkerState()
  const previousCurrent = workerState?.current
  const previousFilepath = workerState?.filepath
  const filepath = session.file.story.file?.filePath ?? session.file.filePath
  const task = createPreviewTestTask(definition, `${storyId}:${variantId}:${definition.id}`, filepath)

  if (workerState) {
    workerState.filepath = filepath
    workerState.current = task
  }

  try {
    resetSharedExpectState()
    await runSingleDefinition(definition, storyId, variantId)
  }
  catch (error) {
    // Hook failures after the test lifecycle can escape after its task already
    // settled. Keep that failure in the one portable case result as well.
    if (!task.result.errors.includes(error)) task.result.errors.push(error)
    task.result.state = 'fail'
  }
  finally {
    if (workerState) {
      workerState.current = previousCurrent
      workerState.filepath = previousFilepath
    }
  }

  const errors = task.result.errors.map(serializeTestError)
  return createHistoireTestSummary(storyId, variantId, [toResult(
    definition,
    errors.length ? 'failed' : 'passed',
    errors,
  )])
}
