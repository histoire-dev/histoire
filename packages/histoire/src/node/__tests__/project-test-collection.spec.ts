import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectHistoireProjectTests } from '../test/collect.js'
import { deferred } from './utils/mcp/deferred.js'
import { cleanupRunTestsTempDirs, createRunTestsContext, createRunTestsStoryFile, createVitestInstanceStub } from './utils/run-tests-harness.js'

const mocks = vi.hoisted(() => ({ createVitest: vi.fn(), preflight: vi.fn(async () => {}), cleanup: vi.fn(async () => {}), configure: vi.fn(async () => ({ vitestOptions: {}, viteConfig: {} })) }))
vi.mock('../util/project-vitest.js', () => ({ loadProjectVitest: async () => ({ createVitest: mocks.createVitest }) }))
vi.mock('../test/preflight.js', () => ({ ensureProjectVitest: () => {}, ensureBrowserTestDepsInstalled: mocks.preflight }))
vi.mock('../test/vitest-config.js', () => ({ getTestVitestConfig: mocks.configure }))
vi.mock('../vitest-browser-cleanup.js', () => ({ cleanupVitestBrowserRun: mocks.cleanup }))
vi.mock('../vitest-browser-config/index.js', () => ({ assignVitestBrowserProjectOptions: () => {} }))
afterEach(() => {
  cleanupRunTestsTempDirs()
  vi.clearAllMocks()
})

describe('project definition collection', () => {
  it('collects browser definitions without starting assertion execution and preserves empty variants', async () => {
    const stories = [{ id: 'a:b', variantId: 'c' }, { id: 'a', variantId: 'b:c' }].map(target => createRunTestsStoryFile({ ...target, source: '' }))
    const context = createRunTestsContext(stories)
    const runtime = createVitestInstanceStub()
    const collect = vi.fn(async () => {})
    mocks.createVitest.mockImplementation(async (_mode, options) => ({ ...runtime, collect, state: { getUnhandledErrors: () => [], getTestModules: () => options.include.map((moduleId: string, index: number) => ({ moduleId, errors: () => [], children: { allTests: () => [{ meta: () => ({ histoireCollection: { definitions: index ? [] : [{ id: '0', name: 'test', fullName: 'test', mode: 'skip' }] } }) }] } })) } }))
    const result = await collectHistoireProjectTests(context)
    expect(collect).toHaveBeenCalledWith([], { staticParse: false })
    expect(runtime.start).not.toHaveBeenCalled()
    expect(result.variants.map(entry => entry.target)).toEqual([{ storyId: 'a:b', variantId: 'c' }, { storyId: 'a', variantId: 'b:c' }])
    expect(result.variants.map(entry => entry.collection.definitions.length)).toEqual([1, 0])
    expect(mocks.cleanup).toHaveBeenCalledOnce()
  })
  it('reports missing module metadata as failed collection rather than empty success', async () => {
    const context = createRunTestsContext([createRunTestsStoryFile({ id: 'story', variantId: 'variant', source: '' })])
    mocks.createVitest.mockResolvedValue({ ...createVitestInstanceStub(), collect: vi.fn(async () => {}) })
    const result = await collectHistoireProjectTests(context)
    expect(result.variants[0].collection.error).toBeDefined()
    expect(result.variants[0].collection.definitions).toEqual([])
  })
  it('holds cancellation until acquired browser cleanup finishes', async () => {
    const context = createRunTestsContext([createRunTestsStoryFile({ id: 'story', variantId: 'variant', source: '' })])
    const collection = deferred()
    const cleanup = deferred<{ status: 'graceful' }>()
    const collect = vi.fn(() => collection.promise)
    const cancelCurrentRun = vi.fn(async () => collection.resolve())
    mocks.createVitest.mockResolvedValue({ ...createVitestInstanceStub(), collect, cancelCurrentRun })
    mocks.cleanup.mockImplementationOnce(() => cleanup.promise)
    const abort = new AbortController()
    const pending = collectHistoireProjectTests(context, { signal: abort.signal, strictCleanup: true })
    let settled = false
    void pending.catch(() => {
      settled = true
    })
    await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce())
    abort.abort()
    await vi.waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce())
    expect(cancelCurrentRun).toHaveBeenCalledExactlyOnceWith('keyboard-input')
    expect(cancelCurrentRun).toHaveBeenCalledBefore(mocks.cleanup)
    expect(settled).toBe(false)
    cleanup.resolve({ status: 'graceful' })
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    collection.resolve()
  })
  it('rejects unconfirmed collection cleanup instead of publishing definitions', async () => {
    const context = createRunTestsContext([createRunTestsStoryFile({ id: 'story', variantId: 'variant', source: '' })])
    mocks.createVitest.mockResolvedValue({ ...createVitestInstanceStub(), collect: vi.fn(async () => {}) })
    mocks.cleanup.mockResolvedValueOnce({ status: 'unconfirmed' })
    await expect(collectHistoireProjectTests(context, { strictCleanup: true })).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
    expect(mocks.createVitest).toHaveBeenCalledOnce()
  })
})
