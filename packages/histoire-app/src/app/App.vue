<script lang="ts">
export default {
  name: 'HistoireApp',
}
</script>

<script lang="ts" setup>
import type { StoryFile, Tree } from './types'
import { useTitle } from '@vueuse/core'
import { onUpdate, files as rawFiles, tree as rawTree } from 'virtual:$histoire-stories'
import { computed, onMounted, ref, watch } from 'vue'
import AppHeader from './components/app/AppHeader.vue'
import Breadcrumb from './components/app/Breadcrumb.vue'
import InitialLoading from './components/app/InitialLoading.vue'
import BaseSplitPane from './components/base/BaseSplitPane.vue'
import CommandPromptsModal from './components/command/CommandPromptsModal.vue'
import LayoutModal from './components/layout/LayoutModal.vue'
import SearchModal from './components/search/SearchModal.vue'
import GenericMountStory from './components/story/GenericMountStory.vue'
import StoryList from './components/tree/StoryList.vue'
import { useCommandStore } from './stores/command'
import { useLayoutStore } from './stores/layout'
import { useStoryStore } from './stores/story'
import { histoireConfig } from './util/config'
import { onKeyboardShortcut } from './util/keyboard'
import { mapFile } from './util/mapping'
import { isMobile } from './util/responsive'

const files = ref<StoryFile[]>(rawFiles.map(file => mapFile(file)))
const tree = ref<Tree>(rawTree)

onUpdate((newFiles: StoryFile[], newTree: Tree) => {
  loading.value = false
  files.value = newFiles.map((file) => {
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
watch(stories, (value) => {
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
    return `${title} | ${histoireConfig.theme.title}`
  }
  return histoireConfig.theme.title
}))

// Search

const loadSearch = ref(false)
const isSearchOpen = ref(false)

// Layout

const isLayoutOpen = ref(false)

watch(isSearchOpen, (value) => {
  if (value) {
    loadSearch.value = true
  }
})

onKeyboardShortcut(['ctrl+k', 'meta+k'], (event) => {
  isSearchOpen.value = true
  event.preventDefault()
})

const loading = ref(false)

if (import.meta.hot && !rawFiles.length) {
  loading.value = true
  import.meta.hot.on('histoire:all-stories-loaded', () => {
    loading.value = false
  })
}

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const commandStore = useCommandStore()
const layoutStore = useLayoutStore()
</script>

<template>
  <div
    v-if="storyStore.currentStory"
    class="histoire-app htw-hidden"
  >
    <GenericMountStory
      :key="storyStore.currentStory.id"
      :story="storyStore.currentStory"
    />
  </div>

  <div
    class="htw-h-screen htw-bg-white dark:htw-bg-gray-700 dark:htw-text-gray-100"
    :style="{
      // Prevent flash of content
      opacity: mounted ? 1 : 0,
    }"
  >
    <div
      v-if="isMobile"
      class="htw-h-full htw-flex htw-flex-col htw-divide-y htw-divide-gray-100 dark:htw-divide-gray-800"
    >
      <AppHeader @search="isSearchOpen = true" />
      <Breadcrumb
        :tree="tree"
        :stories="stories"
      />
      <RouterView class="htw-grow" />
    </div>

    <div
      v-else
      class="htw-h-full htw-flex htw-flex-col"
    >
      <AppHeader
        class="htw-flex-none"
        @layout="isLayoutOpen = true"
        @search="isSearchOpen = true"
      />

      <BaseSplitPane
        v-if="layoutStore.settings.storyListVisible"
        save-id="main-horiz"
        :min="5"
        :max="50"
        :default-split="15"
        class="htw-flex-1 htw-min-h-0"
      >
        <template #first>
          <div class="htw-flex htw-flex-col htw-h-full htw-bg-gray-100 dark:htw-bg-gray-750 __histoire-pane-shadow-from-right">
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
      <RouterView
        v-else
        class="htw-flex-1 htw-min-h-0"
      />
    </div>

    <LayoutModal
      v-if="!isMobile"
      :shown="isLayoutOpen"
      @close="isLayoutOpen = false"
    />

    <SearchModal
      v-if="loadSearch"
      :shown="isSearchOpen"
      @close="isSearchOpen = false"
    />

    <CommandPromptsModal
      v-if="__HISTOIRE_DEV__"
      :shown="commandStore.showPromptsModal"
      @close="commandStore.showPromptsModal = false"
    />
  </div>

  <transition name="__histoire-fade">
    <InitialLoading
      v-if="loading"
    />
  </transition>
</template>
