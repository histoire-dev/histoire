<script lang="ts" setup>
import { Story } from '../types'
import BaseListItemLink from './base/BaseListItemLink.vue'
import { Icon } from '@iconify/vue'
import { computed, withDefaults } from 'vue'

const props = withDefaults(defineProps<{
  story: Story
  depth?: number
}>(), {
  depth: 0,
})

const filePadding = computed(() => {
  return (props.depth * 16) + 'px'
})

const iconColor = computed(() => props.story.iconColor)
</script>

<template>
  <div>
    <BaseListItemLink
      v-slot="{ active }"
      :to="{
        name: 'story',
        params: {
          storyId: story.id,
        },
      }"
      class="htw-pl-0.5 htw-pr-2 htw-py-2"
    >
      <span class="bind-tree-margin htw-flex htw-items-center htw-gap-2 htw-pl-5 htw-min-w-0">
        <Icon
          :icon="story.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-5 htw-h-5 htw-flex-none"
          :class="{
            'htw-text-primary-500': !active && !story.iconColor,
            'bind-icon-color': !active && story.iconColor,
          }"
        />
        <span class="htw-truncate">{{ story.title }}</span>
      </span>

      <span class="htw-opacity-40 htw-text-sm">
        {{ story.variants.length }}
      </span>
    </BaseListItemLink>
  </div>
</template>

<style scoped>
.bind-tree-margin {
  margin-left: v-bind(filePadding);
}

.bind-icon-color {
  color: v-bind(iconColor);
}
</style>
