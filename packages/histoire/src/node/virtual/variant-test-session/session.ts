import type { HistoireTestDefinition, StoryFile } from '@histoire/shared'
import type { SessionStoryFile } from './types.js'
import { collectHistoireTests } from '@histoire/shared'
import { bootstrapVariant, mountRenderVariant } from '../variant-test-mount.js'
import { dedupeCollectedTestDefinitionGroups } from './definitions.js'
import { groupRegistrationsByExecution } from './registrations.js'
import { withRegistry } from './registry.js'

/** A mounted variant with its collected tests, owned by the caller until `cleanup`. */
export interface VariantSession {
  file: StoryFile
  definitions: HistoireTestDefinition[]
  cleanup: () => void
}

export interface CreateVariantSessionOptions {
  /** Positions the render mount off the viewport (see `VariantTestSessionOptions`). */
  offscreenRenderMount: boolean
}

/**
 * Mounts a variant (bootstrap mount, then render mount) and collects the tests
 * every mount phase registered.
 * @param storyFile The mapped story file and its import-time registrations.
 * @param variantId The variant to mount.
 * @param options Mount options for this session.
 * @returns The mounted session; the caller MUST call `cleanup()`.
 */
export async function createVariantSession(
  storyFile: SessionStoryFile,
  variantId: string,
  options: CreateVariantSessionOptions,
): Promise<VariantSession> {
  const { file, importedDefinitions } = storyFile
  const bootstrap = await bootstrapVariant(file, variantId, withRegistry)

  // Hoisted so the catch can unmount it: `collectHistoireTests` below runs
  // user registration callbacks that can throw AFTER a successful mount. A
  // try-scoped `rendered` would leak the mounted app + host div on that path,
  // accumulating one offscreen story copy per collect/run attempt.
  let rendered: Awaited<ReturnType<typeof mountRenderVariant>> | undefined
  try {
    rendered = await mountRenderVariant(file, variantId, withRegistry, {
      offscreen: options.offscreenRenderMount,
    })
    const context = {
      story: rendered.story,
      variant: rendered.variant,
      canvas: rendered.canvas,
    }
    const registrationGroups = groupRegistrationsByExecution([
      importedDefinitions,
      bootstrap.registrations,
      rendered.registrations,
    ])
    const ownExecutionIds = new Set([...bootstrap.ownExecutionIds, ...rendered.ownExecutionIds])
    const definitions = dedupeCollectedTestDefinitionGroups(
      registrationGroups.map(group => ({
        definitions: collectHistoireTests(group.registrations, context),
        // Untagged registrations (module scope, or a support plugin that does
        // not mark its mounts) keep the previous behaviour: they can only come
        // from the story module this session imported.
        own: group.executionId === undefined || ownExecutionIds.has(group.executionId),
      })),
    )

    return {
      file,
      definitions,
      cleanup() {
        rendered.cleanup()
        bootstrap.cleanup()
      },
    }
  }
  catch (error) {
    rendered?.cleanup()
    bootstrap.cleanup()
    throw error
  }
}
