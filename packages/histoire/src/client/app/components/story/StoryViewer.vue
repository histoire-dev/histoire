<script lang="ts" setup>
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import StoryVariantListItem from './StoryVariantListItem.vue'
import StoryVariantGridItem from './StoryVariantGridItem.vue'
import StoryVariantSingleView from './StoryVariantSingleView.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()
</script>

<template>
  <div class="htw-bg-gray-50 htw-h-full dark:htw-bg-gray-750">
    <div
      v-if="storyStore.currentStory.layout.type === 'grid'"
      class="htw-h-full htw-overflow-y-auto"
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

    <template v-else-if="storyStore.currentStory.layout.type === 'single'">
      <div
        v-if="hasSingleVariant && storyStore.currentVariant"
        class="htw-p-2 htw-h-full"
      >
        <StoryVariantSingleView
          :variant="storyStore.currentVariant"
          :story="storyStore.currentStory"
        />
      </div>
      <BaseSplitPane
        v-else
        save-id="story-single-main-split"
        :min="5"
        :max="40"
        :default-split="17"
      >
        <template #first>
          <div class="htw-h-full htw-overflow-y-auto">
            <StoryVariantListItem
              v-for="(variant, index) of storyStore.currentStory.variants"
              :key="index"
              :variant="variant"
            />
          </div>
        </template>
        <template #last>
          <div
            v-if="storyStore.currentVariant"
            class="htw-p-2 htw-h-full"
          >
            <StoryVariantSingleView
              :variant="storyStore.currentVariant"
              :story="storyStore.currentStory"
            />
          </div>
        </template>
      </BaseSplitPane>
    </template>
  </div>
</template>
