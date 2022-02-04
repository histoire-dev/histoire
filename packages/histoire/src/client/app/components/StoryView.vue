<script lang="ts" setup>
import { useStoryStore } from '../stores/story'
import BaseSplitPane from './base/BaseSplitPane.vue'
import StoryVariantListItem from './StoryVariantListItem.vue'
import StoryVariantGridItem from './StoryVariantGridItem.vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StoryVariantSingleView from './StoryVariantSingleView.vue'
import BaseEmpty from './base/BaseEmpty.vue'
import StoryControls from './StoryControls.vue'
import StorySourceCode from './StorySourceCode.vue'

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
        <div class="htw-bg-zinc-50 htw-h-full dark:htw-bg-zinc-750">
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

          <BaseSplitPane
            v-else-if="storyStore.currentStory.layout.type === 'single'"
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

        <BaseSplitPane
          v-else
          save-id="story-sidepane"
          orientation="portrait"
          class="htw-h-full"
        >
          <template #first>
            <StoryControls
              :story="storyStore.currentStory"
              :variant="currentVariant"
              class="htw-h-full htw-overflow-auto"
            />
          </template>

          <template #last>
            <StorySourceCode
              :variant="currentVariant"
              class="htw-h-full"
            />
          </template>
        </BaseSplitPane>
      </template>
    </BaseSplitPane>
  </div>
</template>
