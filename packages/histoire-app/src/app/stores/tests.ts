import type { HistoireResolvedTestCase, HistoireSerializedTestDefinition, HistoireTestRunSummary } from '@histoire/shared'
import { mergeTestDefinitionsAndSummary } from '@histoire/shared'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { STORY_CHANGED_EVENT } from '../util/hot.js'
import { usePreviewRuntimeStore } from './preview-runtime.js'
import { useStoryStore } from './story.js'
import { watchCurrentVariantTestCollection } from './test-collection.js'

export const useTestsStore = defineStore('tests', () => {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const storyStore = useStoryStore()
  const definitions = ref<Record<string, HistoireSerializedTestDefinition[]>>({})
  const summaries = ref<Record<string, HistoireTestRunSummary>>({})
  const collecting = ref<Record<string, boolean>>({})
  const stale = ref<Record<string, boolean>>({})
  const running = ref(false)

  const currentKey = computed(() => {
    if (!storyStore.currentStory || !storyStore.currentVariant) {
      return null
    }
    return `${storyStore.currentStory.id}:${storyStore.currentVariant.id}`
  })

  const currentDefinitions = computed(() => currentKey.value ? definitions.value[currentKey.value] ?? [] : [])
  const currentSummary = computed(() => currentKey.value ? summaries.value[currentKey.value] ?? null : null)
  const currentStale = computed(() => currentKey.value ? stale.value[currentKey.value] ?? false : false)
  const currentFailed = computed(() => currentSummary.value?.failed ?? 0)
  const currentCollecting = computed(() => currentKey.value ? collecting.value[currentKey.value] ?? false : false)
  const currentHasTests = computed(() => currentCollecting.value
    || currentDefinitions.value.length > 0
    || (currentSummary.value?.total ?? 0) > 0)
  const currentTests = computed<HistoireResolvedTestCase[]>(() => mergeTestDefinitionsAndSummary(
    currentDefinitions.value,
    currentSummary.value,
  ))

  async function collectCurrentVariantTests() {
    if (!storyStore.currentStory || !storyStore.currentVariant || !storyStore.currentVariant.previewReady) {
      return
    }

    const runKey = `${storyStore.currentStory.id}:${storyStore.currentVariant.id}`
    if (collecting.value[runKey]) {
      return
    }

    collecting.value = {
      ...collecting.value,
      [runKey]: true,
    }

    try {
      const collectedDefinitions = await previewRuntimeStore.collectCurrentFrameTests(runKey)
      definitions.value = {
        ...definitions.value,
        [runKey]: collectedDefinitions,
      }

      if (summaries.value[runKey]) {
        stale.value = {
          ...stale.value,
          [runKey]: true,
        }
      }
    }
    finally {
      collecting.value = {
        ...collecting.value,
        [runKey]: false,
      }
    }
  }

  /**
   * Drops cached definitions for every variant in a changed story so the next
   * preview-ready transition recollects the latest test structure.
   */
  function invalidateStoryDefinitions(storyId: string) {
    const updatedDefinitions = { ...definitions.value }
    let didChange = false

    for (const key of Object.keys(updatedDefinitions)) {
      if (!key.startsWith(`${storyId}:`)) {
        continue
      }

      updatedDefinitions[key] = []
      didChange = true
    }

    if (didChange) {
      definitions.value = updatedDefinitions
    }
  }

  async function runCurrentVariantTests() {
    if (!storyStore.currentStory || !storyStore.currentVariant || running.value) {
      return
    }

    const runKey = `${storyStore.currentStory.id}:${storyStore.currentVariant.id}`
    if (!definitions.value[runKey]) {
      await collectCurrentVariantTests()
    }

    running.value = true

    try {
      const summary = await previewRuntimeStore.runCurrentFrameTests(runKey).catch(async () => {
        return await window.__HST_PLUGIN_API__.sendEvent('runStoryTests', {
          storyId: storyStore.currentStory.id,
          variantId: storyStore.currentVariant.id,
        }) as HistoireTestRunSummary
      })

      summaries.value = {
        ...summaries.value,
        [runKey]: summary,
      }
      stale.value = {
        ...stale.value,
        [runKey]: false,
      }
    }
    finally {
      running.value = false
    }
  }

  function markAllStale() {
    if (!Object.keys(summaries.value).length) {
      return
    }

    stale.value = Object.keys(summaries.value).reduce<Record<string, boolean>>((result, key) => {
      result[key] = true
      return result
    }, {})
  }

  watch(() => storyStore.stories, () => {
    markAllStale()
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

      invalidateStoryDefinitions(storyId)
    })
  }

  return {
    collectCurrentVariantTests,
    currentCollecting,
    currentDefinitions,
    currentFailed,
    currentHasTests,
    currentStale,
    currentSummary,
    currentTests,
    running,
    runCurrentVariantTests,
  }
})
