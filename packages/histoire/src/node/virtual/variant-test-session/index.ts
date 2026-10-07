import type { HistoireSerializedTestDefinition, HistoireTestRegistration } from '@histoire/shared'
import type { VariantSession } from './session.js'
import type { SessionStoryFile, VariantTestSessionOptions } from './types.js'
import { serializeTestDefinitions } from '@histoire/shared'
import { isGeneratedStoryKnownEmpty } from '../../generated-story-metadata.js'
import { createMissingHandlerError, getMatchingDefinition } from './definitions.js'
import { createExclusiveQueue } from './exclusive.js'
import { withRegistry } from './registry.js'
import { runPreviewDefinition } from './run-preview-definition.js'
import { runSingleDefinition } from './run-single-definition.js'
import { runSessionTests } from './run.js'
import { createVariantSession } from './session.js'
import { createStoryModuleCache } from './story-modules.js'
import { enterHistoireTestTask } from './test-task.js'
import { getStoryVariant } from './variant.js'
import { getVitestWorkerState } from './worker-state.js'

export { getMatchingDefinition } from './definitions.js'
export type { VariantSession } from './session.js'
export { hasVanillaSetupHooks } from './setup-hooks.js'
export type { SerializedStoryFile, VariantTestSessionOptions } from './types.js'

/**
 * Creates the browser-side session driving story test collection and execution.
 *
 * The same session object is reused for the whole lifetime of the preview
 * iframe (or of the Vitest test harness), so it owns the story module cache and
 * serializes its flows — collect and run both take over the global test
 * registry while they mount a variant.
 *
 * Execution is split by ownership: run.ts walks preview suites once, while
 * run-single-definition.ts wraps each CLI test in its own mounted suites.
 * Both use run-definition.ts for the per-test lifecycle, hooks.ts and
 * around-hooks.ts for setup/teardown, and task-callbacks.ts for final results.
 * @param options Baked story metadata, module loaders and mount options.
 */
export function createVariantTestSession(options: VariantTestSessionOptions) {
  const storyModules = createStoryModuleCache(options)
  const runExclusive = createExclusiveQueue()

  /** Mounts a variant and collects its tests; the caller owns the cleanup. */
  async function openVariantSession(
    storyId: string,
    variantId: string,
    storyFile?: SessionStoryFile,
  ): Promise<VariantSession> {
    return createVariantSession(
      storyFile ?? await storyModules.createSessionStoryFile(storyId),
      variantId,
      {
        offscreenRenderMount: options.offscreenRenderMount ?? false,
        mountTimeoutMs: options.mountTimeoutMs,
      },
    )
  }

  /** Loads the visible preview while retaining its module-scope registrations for tests. */
  async function loadStoryFile(storyId: string) {
    // Imports borrow the same global registry as test mounts, so both use one queue.
    return runExclusive(async () => (await storyModules.createSessionStoryFile(storyId, false)).file)
  }

  /**
   * Collects the tests a variant registers, without running them.
   * @returns The serialized definitions, in registration order.
   */
  async function collectVariantTests(storyId: string, variantId: string): Promise<HistoireSerializedTestDefinition[]> {
    return runExclusive(async () => {
      const storyFile = await storyModules.createSessionStoryFile(storyId)
      const setupProbe = options.canSkipKnownEmptyCollection
      if (
        setupProbe
        && !storyFile.importedDefinitions.length
        && isGeneratedStoryKnownEmpty(storyFile.file.component)
        && !hasStorySetupApp(storyFile.file.component)
      ) {
        const setupRegistrations: HistoireTestRegistration[] = []
        let canSkip = setupProbe === true

        if (typeof setupProbe === 'function') {
          try {
            await withRegistry(setupRegistrations, true, async () => {
              canSkip = await setupProbe()
            })
          }
          catch {
            // If the probe fails, leave setup imports and errors to real mounts.
            canSkip = false
          }

          if (setupRegistrations.length) {
            storyModules.rememberSetupModuleRegistrations(storyId, setupRegistrations)
            storyFile.importedDefinitions.push(...setupRegistrations)
          }
        }

        if (canSkip && !setupRegistrations.length) {
          // Validate against current catalog metadata before taking the shortcut.
          getStoryVariant(storyFile.file, variantId)
          return []
        }
      }

      const session = await openVariantSession(storyId, variantId, storyFile)

      try {
        return serializeTestDefinitions(session.definitions)
      }
      finally {
        session.cleanup()
      }
    })
  }

  /**
   * Runs a single previously collected test, re-resolving it against a freshly
   * mounted variant. Used by the Vitest test harness, which owns the reporting.
   */
  async function runCollectedTest(storyId: string, variantId: string, definition: HistoireSerializedTestDefinition) {
    return runExclusive(async () => {
      const session = await openVariantSession(storyId, variantId)
      const leaveTask = enterHistoireTestTask(getVitestWorkerState()?.current)

      try {
        const currentDefinition = getMatchingDefinition(session.definitions, definition)

        if (currentDefinition?.mode === 'skip' || currentDefinition?.mode === 'todo') {
          return
        }

        if (!currentDefinition) {
          throw createMissingHandlerError(definition.fullName, storyId, variantId)
        }

        await runSingleDefinition(currentDefinition, storyId, variantId)
      }
      finally {
        leaveTask()
        session.cleanup()
      }
    })
  }

  /** Runs every test of a variant and returns the summary shown by the host UI. */
  async function runVariantTests(storyId: string, variantId: string) {
    return runExclusive(async () => {
      const session = await openVariantSession(storyId, variantId)

      try {
        return await runSessionTests(session, storyId, variantId)
      }
      finally {
        session.cleanup()
      }
    })
  }

  /** Runs one case in a fresh hidden preview document. */
  async function runPreviewTestCase(storyId: string, variantId: string, definition: HistoireSerializedTestDefinition) {
    return runExclusive(async () => {
      const session = await openVariantSession(storyId, variantId)

      try {
        return await runPreviewDefinition(session, storyId, variantId, definition)
      }
      finally {
        session.cleanup()
      }
    })
  }

  return {
    collectVariantTests,
    loadStoryFile,
    // Exposed so the preview runtime imports the story at the same version as
    // the session, instead of ending up with two module instances of it.
    getStoryModuleVersion: storyModules.getStoryModuleVersion,
    invalidateStory: storyModules.invalidateStory,
    runCollectedTest,
    runPreviewTestCase,
    runVariantTests,
  }
}

/**
 * Checks generated raw story options for setup callbacks that can register tests.
 * @param component Imported story component object.
 */
function hasStorySetupApp(component: unknown) {
  if (!component || typeof component !== 'object') {
    return false
  }

  const story = component as {
    setupApp?: unknown
    variants?: Array<{ setupApp?: unknown }>
  }

  return typeof story.setupApp === 'function'
    || Boolean(story.variants?.some(variant => typeof variant.setupApp === 'function'))
}
