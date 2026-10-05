import type { HistoireResolvedTestCase, HistoireSerializedTestDefinition, HistoireTestError, HistoireTestRunSummary } from '@histoire/shared'
import { createFailedRunSummary, getVariantStateKey, mergeTestDefinitionsAndSummary, serializeTestError } from '@histoire/shared'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { STORY_CHANGED_EVENT } from '../util/hot.js'
import { usePreviewRuntimeStore } from './preview-runtime.js'
import { useStoryStore } from './story.js'
import { watchCurrentVariantTestCollection } from './test-collection.js'
import { isPreviewNavigationAbort, omitTestStoreKeys } from './tests-utils.js'

export const useTestsStore = defineStore('tests', () => {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const storyStore = useStoryStore()
  const definitions = ref<Record<string, HistoireSerializedTestDefinition[]>>({})
  const summaries = ref<Record<string, HistoireTestRunSummary>>({})
  const collecting = ref<Record<string, boolean>>({})
  // Preview-side collection crash per runKey — distinguishes "no tests
  // registered" from a story whose collection failed (e.g. broken module).
  const collectErrors = ref<Record<string, HistoireTestError | null>>({})
  const stale = ref<Record<string, boolean>>({})
  // Keyed by runKey (`storyId:variantId`) so a run on one variant does not
  // disable the Run button for every other variant.
  const running = ref<Record<string, boolean>>({})
  // Bumped whenever a story is invalidated, so a collection that was already in
  // flight can tell that its result describes a version of the story that no
  // longer exists. Not reactive: only in-flight requests read it.
  const storyEpochs = new Map<string, number>()
  // Story objects of the last story-list pass, to tell which stories a list
  // change actually touched.
  let lastStorySnapshot = new Map<string, unknown>()

  const currentKey = computed(() => {
    if (!storyStore.currentStory || !storyStore.currentVariant) {
      return null
    }
    return getVariantStateKey(storyStore.currentStory.id, storyStore.currentVariant.id)
  })

  const currentDefinitions = computed(() => currentKey.value ? definitions.value[currentKey.value] ?? [] : [])
  const currentSummary = computed(() => currentKey.value ? summaries.value[currentKey.value] ?? null : null)
  const currentStale = computed(() => currentKey.value ? stale.value[currentKey.value] ?? false : false)
  const currentFailed = computed(() => currentSummary.value?.failed ?? 0)
  const currentCollecting = computed(() => currentKey.value ? collecting.value[currentKey.value] ?? false : false)
  const currentCollectError = computed(() => currentKey.value ? collectErrors.value[currentKey.value] ?? null : null)
  const currentRunning = computed(() => currentKey.value ? running.value[currentKey.value] ?? false : false)
  const currentHasTests = computed(() => currentCollecting.value
    || currentDefinitions.value.length > 0
    || (currentSummary.value?.total ?? 0) > 0
    // A crashed collection must not present as "no tests" — keep the Tests
    // tab prominent so the failure is noticed.
    || currentCollectError.value !== null)
  const currentTests = computed<HistoireResolvedTestCase[]>(() => mergeTestDefinitionsAndSummary(
    currentDefinitions.value,
    currentSummary.value,
  ))
  async function collectCurrentVariantTests() {
    if (!storyStore.currentStory || !storyStore.currentVariant || !storyStore.currentVariant.previewReady) {
      return
    }

    const storyId = storyStore.currentStory.id
    const runKey = getVariantStateKey(storyId, storyStore.currentVariant.id)!
    if (collecting.value[runKey]) {
      return
    }

    // Captured before the request: a hot update landing while it is in flight
    // invalidates the story, and the reply then describes the pre-update module.
    const epoch = storyEpochs.get(storyId) ?? 0

    collecting.value = {
      ...collecting.value,
      [runKey]: true,
    }

    try {
      // Overlapping collections queue in the preview-runtime store, but the
      // request can still reject (iframe detached/reloaded mid-flight, 15s
      // timeout). Those rejections must NOT escape this async watcher
      // callback (unhandled rejection) and must NOT clobber any previously
      // collected definitions for this runKey.
      const result = await previewRuntimeStore.collectCurrentFrameTests(runKey)
      if ((storyEpochs.get(storyId) ?? 0) !== epoch) {
        // The story was invalidated while collecting: publishing these
        // definitions would resurrect the pre-update ones the invalidation just
        // dropped, and nothing would recollect them afterwards.
        return
      }
      definitions.value = {
        ...definitions.value,
        [runKey]: result.definitions,
      }
      collectErrors.value = {
        ...collectErrors.value,
        [runKey]: result.error ?? null,
      }

      if (summaries.value[runKey]) {
        stale.value = {
          ...stale.value,
          [runKey]: true,
        }
      }
    }
    catch (error) {
      // Navigation aborts and replies invalidated by HMR are expected. A real
      // timeout or transport defect must remain visible instead of looking
      // like a story that registered no tests.
      if ((storyEpochs.get(storyId) ?? 0) !== epoch || isPreviewNavigationAbort(error)) {
        return
      }
      collectErrors.value = {
        ...collectErrors.value,
        [runKey]: serializeTestError(error),
      }
    }
    finally {
      // Delete instead of storing `false`: only in-flight collections are
      // tracked, so the record stays bounded.
      collecting.value = omitTestStoreKeys(collecting.value, key => key === runKey)
    }
  }

  /**
   * Drops cached definitions for every variant in a changed story so the next
   * preview-ready transition recollects the latest test structure.
   *
   * The entries are deleted, not emptied: an empty-but-present entry would make
   * {@link runCurrentVariantTests} skip collection and run an outdated (empty)
   * test structure. Summaries are kept so the panel still shows the last run
   * results, flagged stale once the recollection lands.
   * @param storyId Id of the story whose file changed.
   */
  function invalidateStoryTests(storyId: string) {
    const isStoryKey = (key: string) => key.startsWith(`${storyId}:`)
    storyEpochs.set(storyId, (storyEpochs.get(storyId) ?? 0) + 1)
    definitions.value = omitTestStoreKeys(definitions.value, isStoryKey)
    collectErrors.value = omitTestStoreKeys(collectErrors.value, isStoryKey)
  }

  /**
   * Reclaims the entries of stories that are no longer part of the story list
   * (deleted or renamed files), which would otherwise be kept forever.
   *
   * The current variant is always kept: a transient empty story list must never
   * blank out the panel of the story being displayed.
   */
  function forgetRemovedStories() {
    const prefixes = storyStore.stories.map(story => `${story.id}:`)
    const isRemoved = (key: string) => key !== currentKey.value
      && !prefixes.some(prefix => key.startsWith(prefix))

    definitions.value = omitTestStoreKeys(definitions.value, isRemoved)
    summaries.value = omitTestStoreKeys(summaries.value, isRemoved)
    collectErrors.value = omitTestStoreKeys(collectErrors.value, isRemoved)
    stale.value = omitTestStoreKeys(stale.value, isRemoved)
    // `collecting`/`running` are owned by in-flight operations, which delete
    // their own key when they settle.
  }

  /** Runs caller-selected engine once; preview failures never start server execution. */
  async function runCurrentVariantTests(mode: 'preview' | 'server' = 'preview') {
    if (!storyStore.currentStory || !storyStore.currentVariant) {
      return
    }

    // Capture identity and revision: navigation/HMR may overtake the run.
    const storyId = storyStore.currentStory.id
    const variantId = storyStore.currentVariant.id
    const runKey = getVariantStateKey(storyId, variantId)!
    const epoch = storyEpochs.get(storyId) ?? 0

    if (running.value[runKey]) {
      return
    }

    if (mode === 'preview' && !definitions.value[runKey]) {
      await collectCurrentVariantTests()
    }
    if ((storyEpochs.get(storyId) ?? 0) !== epoch) return

    running.value = {
      ...running.value,
      [runKey]: true,
    }

    try {
      const summary = mode === 'server'
        ? await window.__HST_PLUGIN_API__?.sendEvent('runStoryTests', { storyId, variantId }) as HistoireTestRunSummary
        : await previewRuntimeStore.runCurrentFrameTests(runKey)
      if (!summary) throw new Error('Server test execution is unavailable')

      if ((storyEpochs.get(storyId) ?? 0) !== epoch) return
      summaries.value = {
        ...summaries.value,
        [runKey]: summary,
      }
      stale.value = {
        ...stale.value,
        [runKey]: false,
      }
    }
    catch (error) {
      if ((storyEpochs.get(storyId) ?? 0) !== epoch) return
      // Explicit engine failed. Surface failure
      // as a synthetic failed run in the panel — rethrowing would escape into
      // the template click handler as an unhandled rejection with zero UI
      // feedback.
      summaries.value = {
        ...summaries.value,
        [runKey]: createFailedRunSummary(storyId, variantId, error),
      }
    }
    finally {
      // Delete instead of storing `false`: only in-flight runs are tracked, so
      // the record stays bounded.
      running.value = omitTestStoreKeys(running.value, key => key === runKey)
    }
  }

  /**
   * Flags the last run results of some stories as outdated.
   * @param storyIds Stories whose file changed.
   */
  function markStoriesStale(storyIds: string[]) {
    const prefixes = storyIds.map(storyId => `${storyId}:`)
    const outdated = Object.keys(summaries.value).filter(key => prefixes.some(prefix => key.startsWith(prefix)))
    if (!outdated.length) {
      return
    }

    stale.value = {
      ...stale.value,
      ...Object.fromEntries(outdated.map(key => [key, true])),
    }
  }

  /**
   * Flags the run results of the stories a story-list change actually touched.
   *
   * Every collection pass replaces the story list, so flagging all of them
   * would mark every story's results stale each time any single story is
   * edited. Only the stories whose object was replaced are affected.
   */
  function markChangedStoriesStale() {
    const snapshot = new Map<string, unknown>(storyStore.stories.map(story => [story.id, story]))
    const changedIds = [...snapshot.keys()].filter(storyId => (
      lastStorySnapshot.has(storyId) && lastStorySnapshot.get(storyId) !== snapshot.get(storyId)
    ))
    lastStorySnapshot = snapshot
    markStoriesStale(changedIds)
  }

  watch(() => storyStore.stories, () => {
    forgetRemovedStories()
    markChangedStoriesStale()
  })

  watchCurrentVariantTestCollection(() => [
    storyStore.currentStory?.id,
    storyStore.currentVariant?.id,
    storyStore.currentVariant?.previewReady,
  ], async () => {
    await collectCurrentVariantTests()
  })

  if (import.meta.hot) {
    import.meta.hot.on(STORY_CHANGED_EVENT, ({ storyId }) => {
      if (!storyId) {
        return
      }

      invalidateStoryTests(storyId)
      // The story's code changed: whatever its last run reported no longer
      // describes it.
      markStoriesStale([storyId])
    })
  }

  return {
    collectCurrentVariantTests,
    invalidateStoryTests,
    currentCollectError,
    currentCollecting,
    currentDefinitions,
    currentFailed,
    currentHasTests,
    currentRunning,
    currentStale,
    currentSummary,
    currentTests,
    runCurrentVariantTests,
  }
})
