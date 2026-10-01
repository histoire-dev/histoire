import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupRunTestsTempDirs,
  createRunTestsContext,
  createRunTestsStoryFile,
  installRunTestsMocks,
} from './utils/run-tests-harness.js'

/**
 * Which stories a run collects and which of them get a spec: eligibility comes
 * from the browser collection, never from the story source, and an explicit
 * story/variant filter narrows both ends.
 */

let mocks: ReturnType<typeof installRunTestsMocks>
let runHistoireTests: Awaited<ReturnType<ReturnType<typeof installRunTestsMocks>['load']>>

beforeEach(async () => {
  vi.resetModules()
  mocks = installRunTestsMocks()
  runHistoireTests = await mocks.load()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanupRunTestsTempDirs()
})

describe('runHistoireTests targeting', () => {
  it('derives eligibility from collected registrations, not from the story source', async () => {
    // `onTest` is a plain importable function: a story can register tests
    // through a shared helper, a renamed import or a re-export, so its own
    // source contains no literal `onTest(` call. Scanning the source would
    // silently skip those tests (green CI, tests never run) while the in-app
    // collection still shows them.
    const indirectStory = createRunTestsStoryFile({
      id: 'indirect-story',
      variantId: 'indirect-variant',
      source: `
        import { setupStoryTests } from './story-test-helpers'
        setupStoryTests()
      `,
    })
    const plainStory = createRunTestsStoryFile({
      id: 'plain-story',
      variantId: 'plain-variant',
      source: `export default {}`,
    })
    mocks.collectStoriesBrowserMock.mockImplementation(async (_ctx: any, options: any) => ({
      files: options.storyFiles.map((storyFile: any) => ({
        storyFile,
        hasTests: storyFile.story.id === 'indirect-story',
      })),
      failures: [],
    }))

    await runHistoireTests(createRunTestsContext([indirectStory, plainStory]))

    // Every story is collected — a source scan must never remove candidates.
    expect(mocks.collectStoriesBrowserMock.mock.calls[0][1].storyFiles).toEqual([indirectStory, plainStory])
    expect(mocks.createVitestMock).toHaveBeenCalledOnce()
    // The run must not wait for the test run twice: `start()` already resolves
    // once the pass is over.
    const vitest = await mocks.createVitestMock.mock.results[0].value
    expect(vitest.waitForTestRunEnd).not.toHaveBeenCalled()
    expect(mocks.cleanupVitestBrowserRunMock).toHaveBeenCalledOnce()
    // Only the story that actually registered tests gets a spec.
    expect(mocks.createVitestMock.mock.calls[0][1].include).toHaveLength(1)
    // The path keeps the human-readable sanitized variant segment and appends a
    // short hash disambiguator before the .histoire.spec.ts suffix.
    expect(mocks.createVitestMock.mock.calls[0][1].include[0]).toContain('indirect-variant.')
    expect(mocks.createVitestMock.mock.calls[0][1].include[0]).toContain('.histoire.spec.ts')
  })

  it('keeps running the real tests when an unrelated story fails to collect', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const testedStory = createRunTestsStoryFile({
      id: 'tested-story',
      variantId: 'tested-variant',
      source: 'onTest(() => {})',
    })
    const brokenStory = createRunTestsStoryFile({
      id: 'broken-story',
      variantId: 'broken-variant',
      source: 'export default {}',
    })
    // Deriving eligibility from the collection means collecting stories the
    // user never asked about; one of them being broken must not abort the run.
    mocks.collectStoriesBrowserMock.mockImplementation(async (_ctx: any, options: any) => ({
      files: options.storyFiles
        .filter((storyFile: any) => storyFile.story.id === 'tested-story')
        .map((storyFile: any) => ({ storyFile, hasTests: true })),
      failures: [{ relativePath: brokenStory.relativePath, error: 'ReferenceError: boom is not defined' }],
    }))

    const summary = await runHistoireTests(createRunTestsContext([testedStory, brokenStory]))

    // The collection was asked to tolerate per-story failures.
    expect(mocks.collectStoriesBrowserMock.mock.calls[0][1].tolerateStoryFailures).toBe(true)
    // The healthy story's tests still ran.
    expect(mocks.createVitestMock).toHaveBeenCalledOnce()
    expect(mocks.createVitestMock.mock.calls[0][1].include).toHaveLength(1)
    expect(mocks.createVitestMock.mock.calls[0][1].include[0]).toContain('tested-variant.')

    // The broken story is named, with its error, and counted.
    const messages = warnSpy.mock.calls.map(call => String(call[0]))
    expect(messages.some(message => message.includes(brokenStory.relativePath) && message.includes('boom is not defined'))).toBe(true)
    expect(messages.some(message => message.includes('1 story could not be collected'))).toBe(true)

    // A story that never executed may well have registered tests: reporting
    // this run as green would be the same silent false-green the browser-based
    // eligibility check exists to prevent.
    expect(summary.ok).toBe(false)
    expect(summary.uncollectedStories).toEqual([{
      relativePath: brokenStory.relativePath,
      error: 'ReferenceError: boom is not defined',
    }])
    warnSpy.mockRestore()
  })

  it('fails the run when the explicitly targeted story fails to collect', async () => {
    const targetStory = createRunTestsStoryFile({
      id: 'target-story',
      variantId: 'target-variant',
      source: 'onTest(() => {})',
    })
    mocks.collectStoriesBrowserMock.mockImplementation(async () => ({
      files: [],
      failures: [{ relativePath: targetStory.relativePath, error: 'SyntaxError: unexpected token' }],
    }))

    // Answering "no tests matched" to a request we simply failed to honour
    // would hide a broken story behind a green run.
    await expect(runHistoireTests(createRunTestsContext([targetStory]), {
      storyId: 'target-story',
      skipStoryScan: true,
    })).rejects.toThrow(/target-story|unexpected token/)
    expect(mocks.createVitestMock).not.toHaveBeenCalled()
  })

  it('narrows browser collection to the targeted story for variant-scoped runs', async () => {
    const targetStory = createRunTestsStoryFile({
      id: 'target-story',
      variantId: 'target-variant',
      source: 'onTest(() => {})',
    })
    const otherStory = createRunTestsStoryFile({
      id: 'other-story',
      variantId: 'other-variant',
      source: 'onTest(() => {})',
    })

    // Clicking "Run tests" on one variant must not re-collect every other
    // story: an unrelated broken story would fail the run and the collection
    // pass would cost a full headless-browser sweep of the project.
    await runHistoireTests(createRunTestsContext([targetStory, otherStory]), {
      storyId: 'target-story',
      variantId: 'target-variant',
      skipStoryScan: true,
    })

    expect(mocks.collectStoriesBrowserMock).toHaveBeenCalledOnce()
    expect(mocks.collectStoriesBrowserMock.mock.calls[0][1].storyFiles).toEqual([targetStory])

    // The CLI path (no story filter) still collects everything.
    await runHistoireTests(createRunTestsContext([targetStory, otherStory]))
    expect(mocks.collectStoriesBrowserMock.mock.calls[1][1].storyFiles).toEqual([targetStory, otherStory])
  })

  it('collects into detached copies for live dev-context runs', async () => {
    const story = createRunTestsStoryFile({
      id: 'detached-story',
      variantId: 'detached-variant',
      source: 'onTest(() => {})',
    })

    // The dev server keeps collecting into the same `ctx.storyFiles` objects
    // while a test run is in flight, so a run must not write back into them.
    await runHistoireTests(createRunTestsContext([story]), { skipStoryScan: true })
    expect(mocks.collectStoriesBrowserMock.mock.calls[0][1].applyToContext).toBe(false)

    // The CLI path owns its context and may still apply the collected data.
    await runHistoireTests(createRunTestsContext([story]))
    expect(mocks.collectStoriesBrowserMock.mock.calls[1][1].applyToContext).not.toBe(false)
  })

  it('reuses the live context collections when skipStoryScan is set', async () => {
    const story = createRunTestsStoryFile({
      id: 'scan-story',
      variantId: 'scan-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    const { findAllStories } = await import('../stories.js')
    const { scanMarkdownFiles } = await import('../markdown.js')

    // Dev-server invocations run against the live ctx: re-scanning resets
    // ctx.storyFiles (dropping collected story data) and appends duplicate
    // markdown entries — the scan must be skippable.
    await runHistoireTests(createRunTestsContext([story]), { skipStoryScan: true })
    expect(vi.mocked(findAllStories)).not.toHaveBeenCalled()
    expect(vi.mocked(scanMarkdownFiles)).not.toHaveBeenCalled()

    // The CLI path (fresh ctx) still scans by default.
    await runHistoireTests(createRunTestsContext([story]))
    expect(vi.mocked(findAllStories)).toHaveBeenCalledOnce()
    expect(vi.mocked(scanMarkdownFiles)).toHaveBeenCalledOnce()
  })

  it('warns and runs nothing when explicit storyId matches no eligible tests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The targeted story was collected but registered no tests.
    mocks.collectStoriesBrowserMock.mockImplementation(async (_ctx: any, options: any) => ({
      files: options.storyFiles.map((storyFile: any) => ({
        storyFile,
        hasTests: false,
      })),
      failures: [],
    }))

    const summary = await runHistoireTests(createRunTestsContext([createRunTestsStoryFile({
      id: 'plain-story',
      variantId: 'plain-variant',
      source: 'export default {}',
    })]), {
      storyId: 'plain-story',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(mocks.createVitestMock).not.toHaveBeenCalled()
    expect(summary.total).toBe(0)
  })

  it('warns and does not fall back to all stories when explicit variantId matches no eligible tests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const eligibleStory = createRunTestsStoryFile({
      id: 'eligible-story',
      variantId: 'eligible-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    const summary = await runHistoireTests(createRunTestsContext([eligibleStory]), {
      variantId: 'missing-variant',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(mocks.createVitestMock).not.toHaveBeenCalled()
    expect(summary.total).toBe(0)
  })
})
