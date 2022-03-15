<script lang="ts" setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import BaseTab from '../base/BaseTab.vue'
import StoryVariantListItem from './StoryVariantListItem.vue'
import StoryVariantGridItem from './StoryVariantGridItem.vue'
import StoryVariantSingleView from './StoryVariantSingleView.vue'
import StoryControls from './StoryControls.vue'
import StoryDocs from './StoryDocs.vue'
import StorySourceCode from './StorySourceCode.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()

// Selected variant

const hasSingleVariant = computed(() => (storyStore.currentStory?.variants.length === 1))

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
      save-id="story-main"
      :min="30"
      :max="95"
      :default-split="75"
      class="htw-h-full"
    >
      <template #first>
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

      <template #last>
        <BaseEmpty v-if="!storyStore.currentVariant || !storyStore.currentVariant.ready">
          <span>Select a variant</span>
        </BaseEmpty>

        <BaseSplitPane
          v-else
          save-id="story-sidepane"
          orientation="portrait"
          class="htw-h-full"
        >
          <template #first>
            <div class="htw-flex htw-flex-col htw-h-full">
              <nav class="htw-h-10 htw-flex-none htw-border-b htw-border-gray-100 dark:htw-border-gray-750">
                <BaseTab
                  :to="{ ...$route, query: { ...$route.query, tab: '' } }"
                  :matched="!$route.query.tab"
                >
                  Controls
                </BaseTab>
                <BaseTab
                  :to="{ ...$route, query: { ...$route.query, tab: 'docs' } }"
                  :matched="$route.query.tab === 'docs'"
                >
                  Docs
                </BaseTab>
              </nav>

              <component
                :is="$route.query.tab === 'docs'
                  ? StoryDocs
                  : StoryControls"
                :story="storyStore.currentStory"
                :variant="storyStore.currentVariant"
                class="htw-h-full htw-overflow-auto"
              />
            </div>
          </template>

          <template #last>
            <StorySourceCode
              :variant="storyStore.currentVariant"
              class="htw-h-full"
            />
          </template>
        </BaseSplitPane>
      </template>
    </BaseSplitPane>
  </div>
</template>
