<script lang="ts" setup>
// @ts-expect-error virtual module
import { files as rawFiles, onUpdate } from '$histoire-stories'
import { useStoryStore } from './stores/story'
import StoryList from './components/StoryList.vue'
import BaseSplitPane from './components/base/BaseSplitPane.vue'
import { shallowRef } from 'vue'
import AppHeader from './components/app/AppHeader.vue'

const storyStore = useStoryStore()

const files = shallowRef(rawFiles)

onUpdate((newValue) => {
  files.value = newValue
})

</script>

<template>
  <div class="htw-hidden">
    <template
      v-for="storyData of files"
      :key="storyData.id"
    >
      <component
        :is="storyData.component"
        :data="storyData"
      />
    </template>
  </div>

  <div class="htw-h-screen dark:htw-bg-gray-800 dark:htw-text-slate-200">
    <BaseSplitPane
      save-id="main-horiz"
      :min="5"
      :max="50"
      :default-split="15"
      class="htw-h-full"
    >
      <template #first>
        <div class="htw-flex htw-flex-col htw-divide-gray-200 dark:htw-divide-gray-600 htw-divide-y">
          <AppHeader />
          <StoryList
            :stories="storyStore.stories"
            class="htw-h-full"
          />
        </div>
      </template>

      <template #last>
        <RouterView />
      </template>
    </BaseSplitPane>
  </div>
</template>
