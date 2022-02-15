<script lang="ts" setup>
// @ts-expect-error virtual module
import { files as rawFiles, onUpdate, tree } from '$histoire-stories'
import StoryList from './components/StoryList.vue'
import BaseSplitPane from './components/base/BaseSplitPane.vue'
import { computed, markRaw, ref, watch } from 'vue'
import AppHeader from './components/app/AppHeader.vue'
import type { StoryFile, Variant } from './types'
import { useStoryStore } from './stores/story'
import { mapFile } from './util/mapping'

const files = ref<StoryFile[]>(rawFiles.map(file => mapFile(file)))

onUpdate((newValue: StoryFile[]) => {
  files.value = newValue.map(file => {
    const existingFile = files.value.find(f => f.id === file.id)
    return mapFile(file, existingFile)
  })
})

const stories = computed(() => files.value.reduce((acc, file) => {
  acc.push(file.story)
  return acc
}, []))

// Store

const storyStore = useStoryStore()
watch(stories, value => {
  storyStore.setStories(value)
}, {
  immediate: true,
})
</script>

<template>
  <div
    v-if="storyStore.currentStory"
    class="htw-hidden"
  >
    <component
      :is="storyStore.currentStory.file.component"
      :story="storyStore.currentStory"
    />
  </div>

  <div class="htw-h-screen dark:htw-bg-zinc-700 dark:htw-text-slate-100">
    <BaseSplitPane
      save-id="main-horiz"
      :min="5"
      :max="50"
      :default-split="15"
      class="htw-h-full"
    >
      <template #first>
        <div class="htw-flex htw-flex-col htw-divide-zinc-200 dark:htw-divide-zinc-850 htw-divide-y htw-h-full">
          <AppHeader
            class="htw-flex-none"
          />
          <StoryList
            :tree="tree"
            :stories="stories"
            class="htw-flex-1"
          />
        </div>
      </template>

      <template #last>
        <RouterView />
      </template>
    </BaseSplitPane>
  </div>
</template>
