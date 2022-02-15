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
      class="htw-px-0.5 htw-py-2"
    >
      <span class="bind-tree-margin htw-flex htw-items-center htw-gap-2 htw-pl-5">
        <Icon
          :icon="story.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-5 htw-h-5"
          :class="{
            'htw-text-primary-500': !active,
          }"
        />
        <span>{{ story.title }}</span>
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
</style>
