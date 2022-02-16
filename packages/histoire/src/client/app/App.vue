<script lang="ts" setup>
// @ts-expect-error virtual module
import { files as rawFiles, tree as rawTree, onUpdate } from '$histoire-stories'
import StoryList from './components/StoryList.vue'
import BaseSplitPane from './components/base/BaseSplitPane.vue'
import { computed, ref, watch } from 'vue'
import AppHeader from './components/app/AppHeader.vue'
import type { StoryFile, Tree } from './types'
import { useStoryStore } from './stores/story'
import { mapFile } from './util/mapping'
import { useTitle } from '@vueuse/core'
import { histoireConfig } from './util/config.js'

const files = ref<StoryFile[]>(rawFiles.map(file => mapFile(file)))
const tree = ref<Tree>(rawTree)

onUpdate((newFiles: StoryFile[], newTree: Tree) => {
  files.value = newFiles.map(file => {
    const existingFile = files.value.find(f => f.id === file.id)
    return mapFile(file, existingFile)
  })
  tree.value = newTree
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

useTitle(computed(() => {
  if (storyStore.currentStory) {
    let title = storyStore.currentStory.title
    if (storyStore.currentVariant) {
      title += ` › ${storyStore.currentVariant.title}`
    }
    return `${title} | ${histoireConfig.title}`
  }
  return histoireConfig.title
}))
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
        <div class="htw-flex htw-flex-col htw-h-full htw-gap-2">
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
