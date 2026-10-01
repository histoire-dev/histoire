import { pushHistoireTestRegistration, TEST_DEFINITIONS_KEY } from '@histoire/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { it as collectIt } from '../vendors/vitest-collect.js'
import { previewStoryLoading } from '../virtual/preview-runtime/story-loading.js'
import { createSessionOptions, createVariantMountMocks, STORY_ID, VARIANT_ID } from './utils/variant-test-session.js'

describe('preview imports and test registrations', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../virtual/variant-test-mount.js', createVariantMountMocks().moduleFactory)
  })

  it('retains module-scope tests after preview import and after invalidation', async () => {
    const { createVariantTestSession } = await import('../virtual/variant-test-session/index.js')
    const executed = vi.fn()
    // Native imports execute a module once per URL, even across different loaders.
    const modules = new Map<number | undefined, Promise<{ default: object }>>()
    const loader = vi.fn((version?: number) => {
      if (!modules.has(version)) {
        modules.set(version, Promise.resolve().then(() => {
          pushHistoireTestRegistration(() => collectIt(`module ${version ?? 0}`, executed))
          return { default: {} }
        }))
      }
      return modules.get(version)!
    })
    const options = createSessionOptions({ moduleLoaders: { [STORY_ID]: loader } })
    // Execute actual emitted loader glue, so the preview cannot bypass registry ownership.
    // eslint-disable-next-line no-new-func -- execute trusted generated runtime glue against the real session
    const runtime = new Function(
      'files',
      'moduleLoaders',
      'createVariantTestSession',
      'ensureVitestPreviewEnvironment',
      'storyFileCache',
      'selectionState',
      'TEST_DEFINITIONS_KEY',
      `${previewStoryLoading(options.mountTimeoutMs)}
      return { loadStoryFile, variantTestSession, invalidateStoryRuntime }`,
    )(
      options.files,
      options.moduleLoaders,
      createVariantTestSession,
      async () => {},
      new Map(),
      { storyId: STORY_ID },
      TEST_DEFINITIONS_KEY,
    )

    for (const version of [0, 1]) {
      if (version) runtime.invalidateStoryRuntime(STORY_ID)
      const previewFile = await runtime.loadStoryFile(STORY_ID)
      const definitions = await runtime.variantTestSession.collectVariantTests(STORY_ID, VARIANT_ID)
      expect(definitions.map(item => item.name)).toEqual([`module ${version}`])
      const summary = await runtime.variantTestSession.runVariantTests(STORY_ID, VARIANT_ID)
      expect(summary.passed).toBe(1)
      expect(previewFile.story.id).toBe(STORY_ID)
    }
    expect(executed).toHaveBeenCalledTimes(2)
    expect(modules.size).toBe(2)
  })
})
