import type { HistoireSerializedTestDefinition } from '@histoire/shared'
import type { VariantSession } from './session.js'
import type { VariantTestSessionOptions } from './types.js'
import { serializeTestDefinitions } from '@histoire/shared'
import { createMissingHandlerError, getMatchingDefinition } from './definitions.js'
import { createExclusiveQueue } from './exclusive.js'
import { runSessionTests } from './run.js'
import { createVariantSession } from './session.js'
import { createStoryModuleCache } from './story-modules.js'

export { getMatchingDefinition } from './definitions.js'
export type { VariantSession } from './session.js'
export type { SerializedStoryFile, VariantTestSessionOptions } from './types.js'

/**
 * Creates the browser-side session driving story test collection and execution.
 *
 * The same session object is reused for the whole lifetime of the preview
 * iframe (or of the Vitest test harness), so it owns the story module cache and
 * serializes its flows — collect and run both take over the global test
 * registry while they mount a variant.
 * @param options Baked story metadata, module loaders and mount options.
 */
export function createVariantTestSession(options: VariantTestSessionOptions) {
  const storyModules = createStoryModuleCache(options)
  const runExclusive = createExclusiveQueue()

  /** Mounts a variant and collects its tests; the caller owns the cleanup. */
  async function openVariantSession(storyId: string, variantId: string): Promise<VariantSession> {
    return createVariantSession(
      await storyModules.createSessionStoryFile(storyId),
      variantId,
      { offscreenRenderMount: options.offscreenRenderMount ?? false },
    )
  }

  /**
   * Collects the tests a variant registers, without running them.
   * @returns The serialized definitions, in registration order.
   */
  async function collectVariantTests(storyId: string, variantId: string): Promise<HistoireSerializedTestDefinition[]> {
    return runExclusive(async () => {
      const session = await openVariantSession(storyId, variantId)

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

      try {
        const currentDefinition = getMatchingDefinition(session.definitions, definition)

        if (currentDefinition?.mode === 'skip' || currentDefinition?.mode === 'todo') {
          return
        }

        if (!currentDefinition?.handler) {
          throw createMissingHandlerError(definition.fullName, storyId, variantId)
        }

        await currentDefinition.handler()
      }
      finally {
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

  return {
    collectVariantTests,
    // Exposed so the preview runtime imports the story at the same version as
    // the session, instead of ending up with two module instances of it.
    getStoryModuleVersion: storyModules.getStoryModuleVersion,
    invalidateStory: storyModules.invalidateStory,
    runCollectedTest,
    runVariantTests,
  }
}
