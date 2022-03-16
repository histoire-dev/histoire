<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import StoryVariantListItem from './StoryVariantListItem.vue'
import StoryVariantGridItem from './StoryVariantGridItem.vue'
import StoryVariantSingleView from './StoryVariantSingleView.vue'
import { isDesktop } from '../../util/responsive'
import { Icon } from '@iconify/vue'
import SideMenu from '../app/SideMenu.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()

const variant = computed(() => storyStore.currentVariant)

const isMenuOpened = ref(false)

function openMenu () {
  isMenuOpened.value = true
}

function closeMenu () {
  isMenuOpened.value = false
}

watch(variant, () => {
  isMenuOpened.value = false
})
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
      <template v-else>
        <BaseSplitPane
          v-if="isDesktop"
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
        <div v-else>
          <div class="htw-border-b htw-border-gray-100 dark:htw-border-gray-800 htw-p-4 htw-h-16 htw-flex htw-items-center htw-gap-4">
            <a
              class="htw-p-1 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
              @click="openMenu"
            >
              <Icon
                icon="carbon:cube"
                class="htw-w-8 htw-h-8 htw-shrink-0"
              />
            </a>
            <span v-if="variant">
              <Icon
                :icon="variant.icon ?? 'carbon:cube'"
                class="base-list-item-link-icon htw-w-4 htw-h-4 htw-flex-none"
                :class="{
                  'htw-text-gray-500': !variant.iconColor,
                  'bind-icon-color': variant.iconColor,
                }"
              />
              {{ variant.title }}
            </span>
          </div>
          <div
            v-if="storyStore.currentVariant"
            class="htw-p-2 htw-h-full"
          >
            <StoryVariantSingleView
              :variant="storyStore.currentVariant"
              :story="storyStore.currentStory"
            />
          </div>
        </div>
      </template>
    </template>
  </div>
  <SideMenu
    title="Select a variant"
    :is-opened="isMenuOpened"
    @close="closeMenu"
  >
    <StoryVariantListItem
      v-for="(variant, index) of storyStore.currentStory.variants"
      :key="index"
      :variant="variant"
    />
  </SideMenu>
</template>
