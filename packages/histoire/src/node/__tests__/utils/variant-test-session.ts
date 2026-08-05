import type { HistoireTestRegistration, ServerStory } from '@histoire/shared'
import type { VariantTestSessionOptions } from '../../virtual/variant-test-session/index.js'
import { getStoryExecutionId, pushHistoireTestRegistration, TEST_REGISTRY_KEY, withStoryExecution } from '@histoire/shared'
import { vi } from 'vitest'

/** Text the mocked render mount exposes as the collected tests' canvas. */
export const MOCK_CANVAS_TEXT = 'Mocked by Vitest for cache invalidation'

/** Story id used by every variant-test-session spec. */
export const STORY_ID = 'story-id'
/** Variant id used by every variant-test-session spec. */
export const VARIANT_ID = 'variant-id'

/**
 * Replays one execution of a story's setup code.
 *
 * Registrations go through the ambient registry inside a single story-execution
 * window, exactly like `onTest(...)` does while a support plugin mounts the
 * story — so they carry the same execution tag the real collection relies on.
 * @param registry The mount phase's registration list (the ambient registry).
 * @param registrations The `onTest(...)` callbacks that execution emits.
 */
export function runStorySetup(
  registry: HistoireTestRegistration[],
  ...registrations: HistoireTestRegistration[]
) {
  const globals = globalThis as typeof globalThis & {
    [TEST_REGISTRY_KEY]?: HistoireTestRegistration[]
  }
  const previous = globals[TEST_REGISTRY_KEY]
  globals[TEST_REGISTRY_KEY] = registry

  try {
    withStoryExecution(() => {
      for (const registration of registrations) {
        pushHistoireTestRegistration(registration)
      }
    })
  }
  finally {
    globals[TEST_REGISTRY_KEY] = previous
  }
}

/**
 * Creates the `variant-test-mount` module mock shared by the session specs.
 *
 * Real mounting needs a DOM and the built `@histoire/app` bundle, so the mocked
 * phases only open their registration window (which is what the session reads)
 * and hand back the registrations the spec staged for them.
 * @returns The two phases' registration lists and the `vi.doMock` factory.
 */
export function createVariantMountMocks() {
  /** Records the teardown of every mount the session opened. */
  const cleanups = { bootstrap: 0, render: 0 }
  const bootstrapRegistrations: HistoireTestRegistration[] = []
  const renderRegistrations: HistoireTestRegistration[] = []
  /**
   * Registrations captured during the render window that another copy of the
   * story emitted (the visible preview re-rendering it). The mount hands them
   * back — the ambient registry cannot filter them — but never claims them.
   */
  const foreignRegistrations: HistoireTestRegistration[] = []

  /**
   * Executions a mocked mount claims as its own. The real mounts read them off
   * the execution counter around `app.mount()`; the specs stage their setups
   * before the mount instead, so the mock claims the executions of the
   * registrations it hands back.
   */
  function getOwnExecutionIds(registrations: HistoireTestRegistration[]) {
    const ids = new Set<number>()

    for (const registration of registrations) {
      const executionId = getStoryExecutionId(registration)
      if (executionId !== undefined) {
        ids.add(executionId)
      }
    }

    return ids
  }

  function moduleFactory() {
    return {
      bootstrapVariant: vi.fn(async (_file: any, _variantId: string, withRegistry: any) => {
        await withRegistry(bootstrapRegistrations, false, () => {})

        return {
          registrations: bootstrapRegistrations,
          ownExecutionIds: getOwnExecutionIds(bootstrapRegistrations),
          cleanup() {
            cleanups.bootstrap++
          },
        }
      }),
      mountRenderVariant: vi.fn(async (file: any, variantId: string, withRegistry: any) => {
        await withRegistry(renderRegistrations, true, () => {})

        return {
          story: file.story,
          variant: file.story.variants.find((item: any) => item.id === variantId),
          canvas: {
            textContent: MOCK_CANVAS_TEXT,
          },
          registrations: [...renderRegistrations, ...foreignRegistrations],
          ownExecutionIds: getOwnExecutionIds(renderRegistrations),
          cleanup() {
            cleanups.render++
          },
        }
      }),
    }
  }

  return {
    bootstrapRegistrations,
    renderRegistrations,
    foreignRegistrations,
    cleanups,
    moduleFactory,
  }
}

/**
 * Builds the session options for a one-story / one-variant project.
 * @param overrides Options replacing the defaults (module loader, mount flags…).
 */
export function createSessionOptions(
  overrides: Partial<VariantTestSessionOptions> = {},
): VariantTestSessionOptions {
  return {
    files: [{
      id: STORY_ID,
      path: ['Story'],
      filePath: 'src/components/Example.story.vue',
      supportPluginId: 'vue3',
      moduleId: '/src/components/Example.story.vue',
      story: {
        id: STORY_ID,
        title: 'Example',
        layout: {
          type: 'single',
        },
        variants: [{
          id: VARIANT_ID,
          title: 'Default',
        }],
      } as unknown as ServerStory,
    }],
    moduleLoaders: {
      [STORY_ID]: async () => ({ default: {} }),
    },
    runWithDynamicImport(importLoader) {
      return importLoader()
    },
    ...overrides,
  }
}
