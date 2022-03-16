<script lang="ts" setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useStoryStore } from '../../stores/story'

const storyStore = useStoryStore()

const story = computed(() => storyStore.currentStory)

const folders = computed(() => {
  return story.value.file.path.slice(0, -1)
})
</script>

<template>
  <div class="htw-border-b htw-border-t htw-border-gray-100 dark:htw-border-gray-800 htw-p-4 htw-flex htw-items-center htw-gap-4">
    <a class="htw-p-1 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer">
      <Icon
        icon="carbon:menu"
        class="htw-w-8 htw-h-8 htw-shrink-0"
      />
    </a>
    <div
      v-if="story"
      class="htw-flex htw-gap-2 htw-flex-wrap"
    >
      <template
        v-for="(file, key) of folders"
        :key="key"
      >
        <span>
          {{ file }}
        </span>
        <span class="htw-opacity-40">
          /
        </span>
      </template>
      <span class="htw-flex htw-items-center htw-gap-2">
        <Icon
          :icon="story.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-4 htw-h-4 htw-flex-none"
          :class="{
            'htw-text-primary-500': !story.iconColor,
            'bind-icon-color': story.iconColor,
          }"
        />
        {{ story.title }}
        <span class="htw-opacity-40 htw-text-sm">
          {{ story.variants.length }}
        </span>
      </span>
    </div>
  </div>
</template>
