import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { watchCurrentVariantTestCollection } from '../../../../histoire-app/src/app/stores/test-collection.js'
import { installFakeWindow } from './utils/fake-window.js'
import { loadTestsStore, previewRuntime, resetTestsStoreHarness, selectVariant } from './utils/tests-store-harness.js'

/**
 * Behavioral tests for the app-side test COLLECTION path: the readiness gate
 * deciding when to recollect, and how the store surfaces a collection that
 * crashed inside the preview.
 *
 * The run path lives in `tests-store-running.spec.ts`.
 */

let fakeWindow: ReturnType<typeof installFakeWindow>

describe('watchCurrentVariantTestCollection', () => {
  it('collects only once the preview reports the variant ready', () => {
    // Navigating swaps the whole variant object, exactly like the story store
    // does — the new variant carries its own (false) readiness.
    const selection = reactive({ storyId: 'story-a', variant: { id: 'variant-a', previewReady: false } })
    const collect = vi.fn(async () => {})

    const stop = watchCurrentVariantTestCollection(
      () => [selection.storyId, selection.variant.id, selection.variant.previewReady],
      collect,
    )

    // The watcher is immediate, but a not-yet-booted preview must not be asked
    // for tests — the request would land in a dead frame.
    expect(collect).not.toHaveBeenCalled()

    selection.variant.previewReady = true
    // Synchronous flush: no tick is awaited here on purpose, otherwise a fast
    // variant switch could collect against the wrong preview document.
    expect(collect).toHaveBeenCalledTimes(1)

    // A variant switch starts un-booted, so it is gated again ...
    selection.variant = { id: 'variant-b', previewReady: false }
    expect(collect).toHaveBeenCalledTimes(1)

    // ... and collected once that variant boots.
    selection.variant.previewReady = true
    expect(collect).toHaveBeenCalledTimes(2)

    stop()
  })

  it('stops collecting once disposed', () => {
    const selection = reactive({ previewReady: true })
    const collect = vi.fn(async () => {})

    const stop = watchCurrentVariantTestCollection(
      () => ['story-a', 'variant-a', selection.previewReady],
      collect,
    )
    expect(collect).toHaveBeenCalledTimes(1)

    stop()
    selection.previewReady = false
    selection.previewReady = true

    expect(collect).toHaveBeenCalledTimes(1)
  })
})

describe('tests store collection', () => {
  beforeEach(() => {
    fakeWindow = installFakeWindow()
    resetTestsStoreHarness()
    selectVariant('story-a', 'variant-a')
  })

  afterEach(() => {
    fakeWindow.uninstall()
    vi.restoreAllMocks()
  })

  it('keeps a preview-side collection crash visible instead of reporting "no tests"', async () => {
    const store = await loadTestsStore()
    previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({
      definitions: [],
      error: { message: 'Cannot read properties of undefined' },
    }))

    await store.collectCurrentVariantTests()

    expect(store.currentDefinitions).toEqual([])
    expect(store.currentCollectError).toEqual({ message: 'Cannot read properties of undefined' })
    // A crashed collection registers no test, but the Tests tab must stay
    // prominent so the failure is noticed instead of looking like a story that
    // simply has none.
    expect(store.currentHasTests).toBe(true)
  })

  it('clears the collection error once a later collection succeeds', async () => {
    const store = await loadTestsStore()
    previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({
      definitions: [],
      error: { message: 'boom' },
    }))
    await store.collectCurrentVariantTests()
    expect(store.currentCollectError).toBeTruthy()

    previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({
      definitions: [{ id: '0', mode: 'run', name: 'a' }],
      error: null,
    }))
    await store.collectCurrentVariantTests()

    expect(store.currentCollectError).toBeNull()
    expect(store.currentDefinitions).toHaveLength(1)
  })

  it('reports no tests and no error for a story that registers none', async () => {
    const store = await loadTestsStore()
    previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({ definitions: [], error: null }))

    await store.collectCurrentVariantTests()

    expect(store.currentCollectError).toBeNull()
    expect(store.currentHasTests).toBe(false)
  })

  it('scopes definitions and errors to the variant they were collected for', async () => {
    const store = await loadTestsStore()
    previewRuntime.collectCurrentFrameTests = vi.fn(async (key?: string | null) => (
      key === 'story-a:variant-a'
        ? { definitions: [{ id: '0', mode: 'run', name: 'a' }], error: null }
        : { definitions: [], error: { message: 'broken variant' } }
    ))

    await store.collectCurrentVariantTests()
    selectVariant('story-a', 'variant-b')
    await store.collectCurrentVariantTests()

    expect(store.currentDefinitions).toEqual([])
    expect(store.currentCollectError).toEqual({ message: 'broken variant' })

    selectVariant('story-a', 'variant-a')
    expect(store.currentDefinitions).toHaveLength(1)
    expect(store.currentCollectError).toBeNull()
  })

  it('never asks a preview that has not booted the variant yet', async () => {
    const store = await loadTestsStore()
    selectVariant('story-a', 'variant-a', false)

    await store.collectCurrentVariantTests()

    expect(previewRuntime.collectCurrentFrameTests).not.toHaveBeenCalled()
  })
})
