<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = defineProps<{
  variant?: Variant
  story?: Story
}>()

const icon = computed(() => props.variant?.icon ?? props.story?.icon ?? 'carbon:cube')
const iconColor = computed(() => props.variant?.iconColor ?? props.story?.iconColor)
const title = computed(() => props.variant?.title ?? props.story?.title ?? '')
const subtitle = computed(() => {
  if (props.variant && props.story && props.story.title !== props.variant.title) {
    return props.story.title
  }
  return undefined
})
</script>

<template>
  <div class="histoire-toolbar-title htw-flex htw-items-center htw-gap-2 htw-min-w-0">
    <Icon
      :icon="icon"
      class="htw-w-4 htw-h-4 htw-flex-none"
      :class="[
        iconColor ? 'bind-icon-color' : 'htw-text-gray-500 dark:htw-text-gray-400',
      ]"
    />
    <div class="htw-flex htw-flex-col htw-justify-center htw-min-w-0 htw-leading-tight htw-text-center htw-h-[2.25rem]">
      <span class="htw-truncate htw-text-sm htw-font-medium htw-text-gray-900 dark:htw-text-gray-100">{{ title }}</span>
      <span
        v-if="subtitle"
        class="htw-truncate htw-text-xs htw-text-gray-500 dark:htw-text-gray-400"
      >{{ subtitle }}</span>
    </div>
  </div>
</template>

<style scoped>
.bind-icon-color {
  color: v-bind('iconColor');
}
</style>
