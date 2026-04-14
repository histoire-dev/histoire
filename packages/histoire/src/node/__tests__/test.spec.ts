import type { Context } from '../context.js'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Creates minimal histoire context for `runHistoireTests`.
 */
function createContext(storyFiles: any[]): Context {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'histoire-run-tests-'))
  tempDirs.push(root)

  return {
    root,
    config: {} as Context['config'],
    resolvedViteConfig: {} as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles,
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

/**
 * Creates collected story file stub with one variant.
 */
function createStoryFile(options: {
  id: string
  variantId: string
  source: string
}) {
  return {
    id: `${options.id}-file`,
    path: `/virtual-root/src/${options.id}.story.ts`,
    relativePath: `src/${options.id}.story.ts`,
    fileName: options.id,
    supportPluginId: 'vue3',
    moduleId: `/virtual-root/src/${options.id}.story.ts`,
    virtual: true,
    moduleCode: options.source,
    story: {
      id: options.id,
      title: options.id,
      variants: [{
        id: options.variantId,
        title: options.variantId,
      }],
    },
  }
}

describe('runHistoireTests', () => {
  let createVitestMock: ReturnType<typeof vi.fn>
  let collectStoriesBrowserMock: ReturnType<typeof vi.fn>
  let cleanupVitestBrowserRunMock: ReturnType<typeof vi.fn>
  let waitForTestRunEndMock: ReturnType<typeof vi.fn>
  let runHistoireTests: typeof import('../test.js').runHistoireTests

  beforeEach(async () => {
    vi.resetModules()

    waitForTestRunEndMock = vi.fn(async () => {})
    createVitestMock = vi.fn(async (_mode: string, options: any) => ({
      options,
      start: vi.fn(async () => {}),
      waitForTestRunEnd: waitForTestRunEndMock,
      close: vi.fn(async () => {}),
      state: {
        getTestModules: () => [],
        getUnhandledErrors: () => [],
      },
    }))
    collectStoriesBrowserMock = vi.fn(async () => {})
    cleanupVitestBrowserRunMock = vi.fn(async () => {})

    vi.doMock('vitest/node', () => ({
      createVitest: createVitestMock,
      parseCLI: vi.fn(() => ({
        filter: [],
        options: {},
      })),
    }))
    vi.doMock('../markdown.js', () => ({
      createMarkdownFilesWatcher: vi.fn(async () => ({
        stop: vi.fn(async () => {}),
      })),
    }))
    vi.doMock('../stories.js', () => ({
      findAllStories: vi.fn(async () => {}),
    }))
    vi.doMock('../story-collection.js', () => ({
      collectStoriesBrowser: collectStoriesBrowserMock,
    }))
    vi.doMock('../vitest-browser-cleanup.js', () => ({
      cleanupVitestBrowserRun: cleanupVitestBrowserRunMock,
    }))
    vi.doMock('../util/has-vitest.js', () => ({
      hasProjectVitest: vi.fn(() => true),
    }))
    vi.doMock('../util/vitest-errors.js', () => ({
      assertVitestRunHasNoUnhandledErrors: vi.fn(() => {}),
    }))
    vi.doMock('../vite.js', () => ({
      getViteConfigWithPlugins: vi.fn(async () => ({
        viteConfig: {},
      })),
    }))
    vi.doMock('../vitest-browser-config.js', () => ({
      assignVitestBrowserProjectOptions: vi.fn(() => {}),
      closeVitestBrowserResources: vi.fn(async () => {}),
      createVitestBrowserRuntimeConfig: vi.fn(async (_ctx: any, viteConfig: any) => ({
        vitestOptions: {},
        viteConfig,
      })),
      debugVitestBrowserLifecycle: vi.fn(() => {}),
    }))

    ;({ runHistoireTests } = await import('../test.js'))
  })

  it('collects and runs only stories whose source calls onTest', async () => {
    const eligibleStory = createStoryFile({
      id: 'eligible-story',
      variantId: 'eligible-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })
    const skippedStory = createStoryFile({
      id: 'skipped-story',
      variantId: 'skipped-variant',
      source: `
        import { onTest } from 'histoire/client'
        export default {}
      `,
    })

    await runHistoireTests(createContext([eligibleStory, skippedStory]))

    expect(collectStoriesBrowserMock).toHaveBeenCalledWith(
      expect.anything(),
      { storyFiles: [eligibleStory] },
    )
    expect(createVitestMock).toHaveBeenCalledOnce()
    expect(waitForTestRunEndMock).not.toHaveBeenCalled()
    expect(cleanupVitestBrowserRunMock).toHaveBeenCalledOnce()
    expect(createVitestMock.mock.calls[0][1].include).toHaveLength(1)
    expect(createVitestMock.mock.calls[0][1].include[0]).toContain('eligible-variant.histoire.spec.ts')
  })

  it('warns and runs nothing when explicit storyId matches no eligible tests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const summary = await runHistoireTests(createContext([createStoryFile({
      id: 'plain-story',
      variantId: 'plain-variant',
      source: 'export default {}',
    })]), {
      storyId: 'plain-story',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(createVitestMock).not.toHaveBeenCalled()
    expect(summary.total).toBe(0)
  })

  it('warns and does not fall back to all stories when explicit variantId matches no eligible tests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const eligibleStory = createStoryFile({
      id: 'eligible-story',
      variantId: 'eligible-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    const summary = await runHistoireTests(createContext([eligibleStory]), {
      variantId: 'missing-variant',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(createVitestMock).not.toHaveBeenCalled()
    expect(summary.total).toBe(0)
  })
})
