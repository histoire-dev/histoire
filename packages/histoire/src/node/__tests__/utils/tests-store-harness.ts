import type { HistoireTestRunSummary } from '@histoire/shared'
import { vi } from 'vitest'
import { reactive } from 'vue'
import { createPiniaStub } from './app-store.js'

/**
 * Shared harness for the app-side `useTestsStore` specs.
 *
 * The store's own logic runs for real; only its two collaborators are replaced:
 * the story store (a plain reactive holder here, so tests can navigate between
 * variants) and the preview-runtime store (the iframe request channel, covered
 * by its own spec). The collection watcher is replaced too so tests drive
 * collection explicitly instead of racing an implicit watcher.
 */

/** Mutable stand-in for the app-side story store. */
export const storyState: {
  currentStory: { id: string } | null
  currentVariant: { id: string, previewReady: boolean } | null
  stories: { id: string, variants: { id: string }[] }[]
} = reactive({
  currentStory: null,
  currentVariant: null,
  stories: [],
})

/** An empty, passing run summary. */
export const EMPTY_SUMMARY: HistoireTestRunSummary = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
} as HistoireTestRunSummary

/** Preview-iframe request channel the store talks to, per test. */
export const previewRuntime = {
  collectCurrentFrameTests: vi.fn(),
  runCurrentFrameTests: vi.fn(),
}

/**
 * Points the harness at a story variant, as the app's router/story store would.
 *
 * @param storyId Story to select.
 * @param variantId Variant to select.
 * @param previewReady Whether the preview iframe has booted that variant.
 */
export function selectVariant(storyId: string, variantId: string, previewReady = true) {
  storyState.currentStory = { id: storyId }
  storyState.currentVariant = { id: variantId, previewReady }
}

/** Resets the harness collaborators to their default, successful behavior. */
export function resetTestsStoreHarness() {
  storyState.currentStory = null
  storyState.currentVariant = null
  storyState.stories = []
  previewRuntime.collectCurrentFrameTests = vi.fn(async () => ({
    definitions: [{ id: '0', mode: 'run', name: 'a' }],
    error: null,
  }))
  previewRuntime.runCurrentFrameTests = vi.fn(async () => EMPTY_SUMMARY)
}

/**
 * Loads the real tests store with the harness collaborators wired in.
 *
 * Mock specifiers are resolved relative to THIS file and must land on the same
 * absolute modules `tests.ts` imports through its own `./*.js` specifiers.
 */
export async function loadTestsStore() {
  vi.resetModules()

  vi.doMock('pinia', () => createPiniaStub())
  vi.doMock('../../../../../histoire-app/src/app/stores/preview-runtime.js', () => ({
    usePreviewRuntimeStore: () => ({
      collectCurrentFrameTests: (key?: string | null) => previewRuntime.collectCurrentFrameTests(key),
      runCurrentFrameTests: (key?: string | null) => previewRuntime.runCurrentFrameTests(key),
    }),
  }))
  vi.doMock('../../../../../histoire-app/src/app/stores/story.js', () => ({
    useStoryStore: () => storyState,
  }))
  vi.doMock('../../../../../histoire-app/src/app/stores/test-collection.js', () => ({
    watchCurrentVariantTestCollection: vi.fn(),
  }))

  const mod = await import('../../../../../histoire-app/src/app/stores/tests.js')
  return mod.useTestsStore()
}
