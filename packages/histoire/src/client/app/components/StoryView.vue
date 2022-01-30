<script lang="ts" setup>
import { useStoryStore } from '../stores/story'
import BaseSplitPane from './base/BaseSplitPane.vue'
import StoryVariantItem from './StoryVariantItem.vue'
import StoryVariantGridItem from './StoryVariantGridItem.vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StoryVariantSingleView from './StoryVariantSingleView.vue'
import BaseEmpty from './base/BaseEmpty.vue'
import StoryControls from './StoryControls.vue'

const storyStore = useStoryStore()

// Selected variant

const route = useRoute()

const currentVariant = computed(() => storyStore.currentStory?.variants.find(v => v.id === route.query.variantId))

// Restore variant selection

watch(currentVariant, value => {
  if (value) {
    storyStore.currentStory.lastSelectedVariant = value
  }
}, {
  immediate: true,
})

const router = useRouter()

watch(() => storyStore.currentStory, () => {
  if (!currentVariant.value && storyStore.currentStory?.lastSelectedVariant) {
    router.replace({
      ...route,
      query: {
        ...route.query,
        variantId: storyStore.currentStory.lastSelectedVariant.id,
      },
    })
  }
})
</script>

<template>
  <BaseEmpty v-if="!storyStore.currentStory">
    <span>Story not found</span>
  </BaseEmpty>

  <div
    v-else
    :key="storyStore.currentStory.mountTime"
    class="htw-h-full"
  >
    <BaseSplitPane
      save-id="story-main"
      :min="30"
      :max="95"
      :default-split="75"
      class="htw-h-full"
    >
      <template #first>
        <div class="htw-bg-gray-50 htw-h-full">
          <div
            v-if="storyStore.currentStory.layout.type === 'grid'"
            class="htw-bg-gray-50 htw-h-full htw-overflow-y-auto"
          >
            <div
              class="htw-grid htw-gap-4 htw-m-4"
              :style="{
                gridTemplateColumns: `repeat(auto-fill, ${storyStore.currentStory.layout.width ?? 200}px)`,
              }"
            >
              <StoryVariantGridItem
                v-for="(variant, index) of storyStore.currentStory.variants"
                :key="index"
                :variant="variant"
                :story="storyStore.currentStory"
              />
            </div>
          </div>

          <BaseSplitPane
            v-else-if="storyStore.currentStory.layout.type === 'single'"
            save-id="story-single-main-split"
            :min="5"
            :max="40"
            :default-split="17"
          >
            <template #first>
              <div class="htw-bg-white htw-h-full htw-overflow-y-auto">
                <StoryVariantItem
                  v-for="(variant, index) of storyStore.currentStory.variants"
                  :key="index"
                  :variant="variant"
                />
              </div>
            </template>

            <template #last>
              <div
                v-if="currentVariant"
                class="htw-p-2 htw-h-full"
              >
                <StoryVariantSingleView
                  :variant="currentVariant"
                  :story="storyStore.currentStory"
                />
              </div>
            </template>
          </BaseSplitPane>
        </div>
      </template>

      <template #last>
        <BaseEmpty v-if="!currentVariant">
          <span>Select a variant</span>
        </BaseEmpty>

        <div
          v-else
          class="htw-h-full"
        >
          <StoryControls
            :story="storyStore.currentStory"
            :variant="currentVariant"
          />
        </div>
      </template>
    </BaseSplitPane>
  </div>
</template>
