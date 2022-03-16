<script lang="ts" setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import { isDesktop } from '../../util/responsive'
import StoryViewer from './StoryViewer.vue'
import StorySidePanel from './StorySidePanel.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()

// Restore variant selection

watch(() => storyStore.currentVariant, value => {
  if (value) {
    storyStore.currentStory.lastSelectedVariant = value
  }
}, {
  immediate: true,
})

watch(() => [storyStore.currentStory, storyStore.currentVariant], () => {
  if (!storyStore.currentVariant) {
    if (storyStore.currentStory?.lastSelectedVariant) {
      setVariant(storyStore.currentStory.lastSelectedVariant.id)
      return
    }

    if (storyStore.currentStory?.variants.length === 1) {
      setVariant(storyStore.currentStory.variants[0].id)
    }
  }
}, {
  immediate: true,
})

function setVariant (variantId: string) {
  router.replace({
    ...route,
    query: {
      ...route.query,
      variantId,
    },
  })
}
</script>

<template>
  <BaseEmpty v-if="!storyStore.currentStory">
    <span>Story not found</span>
  </BaseEmpty>

  <div
    v-else
    class="htw-h-full"
  >
    <BaseSplitPane
      v-if="isDesktop"
      save-id="story-main"
      :min="30"
      :max="95"
      :default-split="75"
      class="htw-h-full"
    >
      <template #first>
        <StoryViewer />
      </template>

      <template #last>
        <StorySidePanel />
      </template>
    </BaseSplitPane>
    <template v-else>
      <StoryViewer />
    </template>
  </div>
</template>
