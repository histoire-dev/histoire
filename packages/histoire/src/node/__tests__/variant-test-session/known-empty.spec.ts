import type { HistoireTestRegistration } from '@histoire/shared'
import { TEST_REGISTRY_KEY } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { it as collectIt } from '../../vendors/vitest-collect.js'
import {
  createSessionOptions,
  runStorySetup,
  STORY_ID,
  useVariantTestSession,
  VARIANT_ID,
} from '../utils/variant-test-session.js'

/** Adds one module-scope test to the active collection registry. */
function registerModuleTest(name: string) {
  const registry = (globalThis as typeof globalThis & {
    [TEST_REGISTRY_KEY]?: HistoireTestRegistration[]
  })[TEST_REGISTRY_KEY]
  registry?.push(() => collectIt(name, () => {}))
}

describe('known-empty generated test collection', () => {
  const runtime = useVariantTestSession()

  it('reuses cached empty metadata and reloads after source invalidation', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    let revision = 0
    const loader = vi.fn(async () => {
      if (revision === 0) {
        return { default: markGeneratedStoryKnownEmpty({ name: 'GeneratedTailwindStory' }) }
      }

      registerModuleTest('tests added after invalidation')

      return { default: { name: 'UpdatedStory' } }
    })
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: true,
      moduleLoaders: { [STORY_ID]: loader },
    }))
    const { bootstrapVariant, mountRenderVariant } = await import('../../virtual/variant-test-mount.js')

    await expect(session.collectVariantTests(STORY_ID, VARIANT_ID)).resolves.toEqual([])
    await expect(session.collectVariantTests(STORY_ID, VARIANT_ID)).resolves.toEqual([])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bootstrapVariant)).not.toHaveBeenCalled()
    expect(vi.mocked(mountRenderVariant)).not.toHaveBeenCalled()

    revision = 1
    session.invalidateStory(STORY_ID)

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
    expect(definitions.map(definition => definition.name)).toEqual(['tests added after invalidation'])
    expect(loader).toHaveBeenCalledTimes(2)
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('mounts marked stories when their module registered tests', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    const loader = vi.fn(async () => {
      registerModuleTest('module registration')

      return { default: markGeneratedStoryKnownEmpty({ name: 'MarkedStoryWithRegistration' }) }
    })
    const session = runtime.createVariantTestSession(createSessionOptions({
      moduleLoaders: { [STORY_ID]: loader },
    }))

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.name)).toEqual(['module registration'])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('keeps explicit test runs on the existing mounted-session path', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: true,
      moduleLoaders: {
        [STORY_ID]: async () => ({
          default: markGeneratedStoryKnownEmpty({ name: 'GeneratedTailwindStory' }),
        }),
      },
    }))

    await expect(session.collectVariantTests(STORY_ID, VARIANT_ID)).resolves.toEqual([])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 0, render: 0 })

    await session.runVariantTests(STORY_ID, VARIANT_ID)
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('collects ordinary module, setup, and render tests without catalog test hints', async () => {
    const options = createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: async () => {
          registerModuleTest('module registration')

          return { default: { name: 'OrdinaryStory' } }
        },
      },
    })
    runStorySetup(runtime.mounts.bootstrapRegistrations, () => {
      collectIt('setup registration', () => {})
    })
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectIt('render registration', () => {})
    })
    expect(options.files[0].story).not.toHaveProperty('hasTests')

    const session = runtime.createVariantTestSession(options)
    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.name)).toEqual([
      'module registration',
      'setup registration',
      'render registration',
    ])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('mounts branded stories when a vanilla setup hook can register tests', async () => {
    const [{ markGeneratedStoryKnownEmpty }, { hasVanillaSetupHooks }] = await Promise.all([
      import('../../generated-story-metadata.js'),
      import('../../virtual/variant-test-session/setup-hooks.js'),
    ])
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: async () => !hasVanillaSetupHooks({ hasSetupVanilla: true }, undefined),
      moduleLoaders: {
        [STORY_ID]: async () => ({
          default: markGeneratedStoryKnownEmpty({ name: 'GeneratedTailwindStory' }),
        }),
      },
    }))
    runStorySetup(runtime.mounts.bootstrapRegistrations, () => {
      collectIt('configured setup registration', () => {})
    })

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.name)).toEqual(['configured setup registration'])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('skips branded stories when configured setup exposes only Vue hooks', async () => {
    const [{ markGeneratedStoryKnownEmpty }, { hasVanillaSetupHooks }] = await Promise.all([
      import('../../generated-story-metadata.js'),
      import('../../virtual/variant-test-session/setup-hooks.js'),
    ])
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: async () => !hasVanillaSetupHooks(
        { hasSetupVanilla: false },
        { setupVue3() {} },
      ),
      moduleLoaders: {
        [STORY_ID]: async () => ({
          default: markGeneratedStoryKnownEmpty({ name: 'GeneratedTailwindStory' }),
        }),
      },
    }))

    await expect(session.collectVariantTests(STORY_ID, VARIANT_ID)).resolves.toEqual([])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 0, render: 0 })
  })

  it('retains one-time setup-module registrations across repeat collection and story invalidation', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    let revision = 0
    let setupModuleImported = false
    const loader = vi.fn(async () => ({
      default: markGeneratedStoryKnownEmpty({ name: `GeneratedTailwindStory${revision}` }),
    }))
    const canSkipKnownEmptyCollection = vi.fn(async () => {
      if (!setupModuleImported) {
        setupModuleImported = true
        registerModuleTest('setup module-scope registration')
      }
      return true
    })
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection,
      moduleLoaders: { [STORY_ID]: loader },
    }))

    for (const expectedRevision of [0, 0, 1]) {
      if (expectedRevision === 1) {
        revision = 1
        session.invalidateStory(STORY_ID)
      }

      const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
      expect(definitions.map(definition => definition.name)).toEqual(['setup module-scope registration'])
    }

    expect(canSkipKnownEmptyCollection).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 3, render: 3 })
  })

  it('mounts branded stories when raw story or variant setupApp can register tests', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: true,
      moduleLoaders: {
        [STORY_ID]: async () => ({
          default: markGeneratedStoryKnownEmpty({
            name: 'GeneratedTailwindStory',
            variants: [{ id: VARIANT_ID, setupApp() {} }],
          }),
        }),
      },
    }))
    runStorySetup(runtime.mounts.bootstrapRegistrations, () => {
      collectIt('variant setupApp registration', () => {})
    })

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.name)).toEqual(['variant setupApp registration'])
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })
  })

  it('preserves unknown story and variant errors before taking the empty fast path', async () => {
    const { markGeneratedStoryKnownEmpty } = await import('../../generated-story-metadata.js')
    const session = runtime.createVariantTestSession(createSessionOptions({
      canSkipKnownEmptyCollection: true,
      moduleLoaders: {
        [STORY_ID]: async () => ({
          default: markGeneratedStoryKnownEmpty({ name: 'GeneratedTailwindStory' }),
        }),
      },
    }))
    const { bootstrapVariant, mountRenderVariant } = await import('../../virtual/variant-test-mount.js')

    await expect(session.collectVariantTests('missing-story', VARIANT_ID))
      .rejects
      .toThrow('Unknown histoire story "missing-story"')
    await expect(session.collectVariantTests(STORY_ID, 'missing-variant'))
      .rejects
      .toThrow(`Unknown histoire variant "missing-variant" in story "${STORY_ID}"`)
    expect(vi.mocked(bootstrapVariant)).not.toHaveBeenCalled()
    expect(vi.mocked(mountRenderVariant)).not.toHaveBeenCalled()
  })
})
