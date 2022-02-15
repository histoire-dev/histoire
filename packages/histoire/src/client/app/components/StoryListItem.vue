<script lang="ts" setup>
import { Story } from '../types'
import BaseListItemLink from './base/BaseListItemLink.vue'
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
      :to="{
        name: 'story',
        params: {
          storyId: story.id,
        },
      }"
    >
      <span class="file-padding">
        {{ story.title }}
      </span>

      <span class="htw-opacity-40 htw-text-sm">
        {{ story.variants.length }}
      </span>
    </BaseListItemLink>
  </div>
</template>

<style scoped>
.file-padding {
    padding-left: v-bind(filePadding);
}
</style>
