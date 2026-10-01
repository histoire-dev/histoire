import type { HistoireTestRunSummary } from '@histoire/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { installFakeWindow } from './utils/fake-window.js'
import { flushMicrotasks } from './utils/flush.js'
import {
  EMPTY_SUMMARY,
  loadTestsStore,
  previewRuntime,
  resetTestsStoreHarness,
  selectVariant,
  storyState,
} from './utils/tests-store-harness.js'

/**
 * Behavioral tests for the app-side test RUN path:
 *  - `running` is keyed per variant, so a hung run on one variant does not
 *    disable the Run button everywhere else,
 *  - a failing preview run degrades into a visible failed summary instead of an
 *    unhandled rejection, using ids captured before the await,
 *  - per-variant entries are dropped (not blanked) when they go stale, so the
 *    store stays bounded over a long dev session.
 *
 * The collection path lives in `tests-store.spec.ts`.
 */

let fakeWindow: ReturnType<typeof installFakeWindow>

describe('tests store dev-run robustness', () => {
  beforeEach(() => {
    fakeWindow = installFakeWindow()
    resetTestsStoreHarness()
    selectVariant('story-a', 'variant-a')
  })

  afterEach(() => {
    fakeWindow.uninstall()
    vi.restoreAllMocks()
  })

  it('keys running per-variant so a hung run does not gate other variants', async () => {
    const store = await loadTestsStore()

    // Seed definitions for both variants so the runs skip collection.
    await store.collectCurrentVariantTests()
    selectVariant('story-a', 'variant-b')
    await store.collectCurrentVariantTests()

    // Variant A's run hangs (never resolves) — it stays "running".
    let resolveA: (value: HistoireTestRunSummary) => void = () => {}
    previewRuntime.runCurrentFrameTests = vi.fn((key: string) => {
      if (key === 'story-a:variant-a') {
        return new Promise<HistoireTestRunSummary>((resolve) => {
          resolveA = resolve
        })
      }
      return Promise.resolve(EMPTY_SUMMARY)
    })

    selectVariant('story-a', 'variant-a')
    const runA = store.runCurrentVariantTests()
    await flushMicrotasks()
    expect(store.currentRunning).toBe(true)

    // Switching to B must expose a fresh, idle Run button and actually run:
    // a store-wide `running` flag would short-circuit the call entirely.
    selectVariant('story-a', 'variant-b')
    expect(store.currentRunning).toBe(false)
    await store.runCurrentVariantTests()
    expect(previewRuntime.runCurrentFrameTests).toHaveBeenCalledWith('story-a:variant-b')
    expect(store.currentRunning).toBe(false)

    // A is still hung and still reported as running.
    selectVariant('story-a', 'variant-a')
    expect(store.currentRunning).toBe(true)

    resolveA(EMPTY_SUMMARY)
    await runA
    expect(store.currentRunning).toBe(false)
  })

  it('surfaces the original error as a failed summary when the plugin API fallback is unavailable', async () => {
    const store = await loadTestsStore()

    previewRuntime.runCurrentFrameTests = vi.fn(async () => {
      throw new Error('preview run blew up')
    })
    // No `__HST_PLUGIN_API__` on window: this is the built/preview app, whose
    // dev-server fallback does not exist.

    // Must not reject into the template click handler (that would be an
    // unhandled rejection with zero UI feedback) — the failure becomes a
    // synthetic failed run summary in the panel.
    await expect(store.runCurrentVariantTests()).resolves.toBeUndefined()

    expect(store.currentSummary?.ok).toBe(false)
    expect(store.currentSummary?.failed).toBe(1)
    // The merged test list keeps the synthetic failing entry visible even
    // though it matches no collected definition.
    const failing = store.currentTests.find((test: any) => test.state === 'failed')
    expect(failing).toBeTruthy()
    expect(JSON.stringify(failing.errors)).toContain('preview run blew up')
  })

  it('uses captured story/variant ids for the fallback after navigation', async () => {
    const store = await loadTestsStore()

    previewRuntime.runCurrentFrameTests = vi.fn(async () => {
      throw new Error('preview unavailable')
    })
    const sendEvent = vi.fn(async () => ({ total: 1, passed: 1, failed: 0, skipped: 0, tests: [] }))
    fakeWindow.window.__HST_PLUGIN_API__ = { sendEvent }

    const runPromise = store.runCurrentVariantTests()

    // Simulate navigation away mid-run: nulling current* must not break the
    // fallback, because the ids were captured before the await.
    await Promise.resolve()
    storyState.currentStory = null
    storyState.currentVariant = null

    await runPromise

    expect(sendEvent).toHaveBeenCalledWith('runStoryTests', {
      storyId: 'story-a',
      variantId: 'variant-a',
    })
  })

  it('swallows a collection rejection without clobbering the definitions it already has', async () => {
    const store = await loadTestsStore()

    await store.collectCurrentVariantTests()
    expect(store.currentDefinitions).toHaveLength(1)

    // An overlapping collection rejects (iframe swapped away mid-request on a
    // fast variant switch, or the 15s reply timeout). The async watcher callback
    // has no catch of its own, so the store must swallow it rather than let it
    // escape as an unhandled rejection — and must keep what it already knows.
    previewRuntime.collectCurrentFrameTests = vi.fn(async () => {
      throw new Error('Preview iframe navigated away before completing the request.')
    })

    await expect(store.collectCurrentVariantTests()).resolves.toBeUndefined()
    expect(store.currentDefinitions).toHaveLength(1)

    // The `finally` cleared the per-variant collecting flag despite the
    // rejection, so a later collection still goes through.
    previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({
      definitions: [{ id: '0', mode: 'run', name: 'a' }, { id: '1', mode: 'run', name: 'b' }],
      error: null,
    }))
    await store.collectCurrentVariantTests()
    expect(store.currentDefinitions).toHaveLength(2)
  })

  it('recollects after an invalidation instead of reusing an empty entry', async () => {
    const store = await loadTestsStore()

    await store.collectCurrentVariantTests()
    expect(previewRuntime.collectCurrentFrameTests).toHaveBeenCalledTimes(1)

    // A story file changed: its cached entry must be dropped, not blanked —
    // an empty-but-present entry would make the next run skip collection and
    // run against an outdated (empty) test structure.
    store.invalidateStoryTests('story-a')

    await store.runCurrentVariantTests()
    expect(previewRuntime.collectCurrentFrameTests).toHaveBeenCalledTimes(2)
  })

  it('discards a collection that was in flight when the story was invalidated', async () => {
    const store = await loadTestsStore()
    let resolveCollection: (value: any) => void = () => {}
    previewRuntime.collectCurrentFrameTests = vi.fn(() => new Promise((resolve) => {
      resolveCollection = resolve
    }))

    const collection = store.collectCurrentVariantTests()
    await flushMicrotasks()

    // The story file changed while the request was in flight: its reply
    // describes the module the invalidation just dropped.
    store.invalidateStoryTests('story-a')
    resolveCollection({ definitions: [{ id: '0', mode: 'run', name: 'stale' }] })
    await collection

    // Publishing them would resurrect pre-update definitions with nothing left
    // to recollect them; the entry must stay absent so the next run collects.
    expect(store.currentDefinitions).toHaveLength(0)
  })

  it.each(['resolve', 'reject'] as const)('ignores a run that %ss after HMR invalidates its story', async (outcome) => {
    const store = await loadTestsStore()
    const story = { id: 'story-a', variants: [{ id: 'variant-a' }] }
    storyState.stories = [story]
    await nextTick()
    await store.collectCurrentVariantTests()
    await store.runCurrentVariantTests()
    const previousSummary = store.currentSummary
    let finish!: () => void
    previewRuntime.runCurrentFrameTests = vi.fn(() => new Promise((resolve, reject) => {
      finish = () => outcome === 'resolve'
        ? resolve({ ...EMPTY_SUMMARY, total: 99 })
        : reject(new Error('old runtime failed'))
    }))
    const sendEvent = vi.fn()
    fakeWindow.window.__HST_PLUGIN_API__ = { sendEvent }
    const run = store.runCurrentVariantTests()
    await flushMicrotasks()
    store.invalidateStoryTests('story-a')
    storyState.stories = [{ ...story }]
    await nextTick()
    expect(store.currentStale).toBe(true)
    finish()
    await run
    expect(store.currentSummary).toBe(previousSummary)
    expect(store.currentStale).toBe(true)
    expect(store.currentRunning).toBe(false)
    expect(sendEvent).not.toHaveBeenCalled()
  })

  it('drops cached entries of stories that no longer exist', async () => {
    const store = await loadTestsStore()

    await store.collectCurrentVariantTests()
    selectVariant('story-b', 'variant-b')
    await store.collectCurrentVariantTests()
    expect(store.currentDefinitions).toHaveLength(1)

    // Back on story-a, story-b disappears from the story list (deleted file).
    selectVariant('story-a', 'variant-a')
    storyState.stories = [{ id: 'story-a', variants: [{ id: 'variant-a' }] }]
    await nextTick()

    // The removed story's entry is reclaimed ...
    selectVariant('story-b', 'variant-b')
    expect(store.currentDefinitions).toHaveLength(0)

    // ... while the surviving story keeps its collected definitions.
    selectVariant('story-a', 'variant-a')
    expect(store.currentDefinitions).toHaveLength(1)
  })

  it('keeps the displayed variant even when the story list momentarily empties', async () => {
    const store = await loadTestsStore()

    await store.collectCurrentVariantTests()
    // A transient empty story list (mid-rescan) must not blank the panel of the
    // story currently on screen.
    storyState.stories = []
    await nextTick()

    expect(store.currentDefinitions).toHaveLength(1)
  })

  it('flags the run results of a re-collected story stale, and only those', async () => {
    const store = await loadTestsStore()
    const storyA = { id: 'story-a', variants: [{ id: 'variant-a' }] }
    const storyB = { id: 'story-b', variants: [{ id: 'variant-b' }] }
    storyState.stories = [storyA, storyB]
    await nextTick()

    await store.collectCurrentVariantTests()
    await store.runCurrentVariantTests()
    expect(store.currentStale).toBe(false)

    // Editing another story replaces the whole story list too: results of the
    // stories that did not change must stay trustworthy.
    storyState.stories = [storyA, { ...storyB }]
    await nextTick()
    expect(store.currentStale).toBe(false)

    // The displayed story was re-collected: its last run no longer describes it.
    storyState.stories = [{ ...storyA }, storyB]
    await nextTick()
    expect(store.currentStale).toBe(true)
  })
})
