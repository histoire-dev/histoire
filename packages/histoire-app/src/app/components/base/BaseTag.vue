<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = defineProps<{
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error'
  icon?: string
}>()

/**
 * Computed classes for the tag based on color prop
 * Includes background, text color, and subtle border styling
 */
const colorClasses = computed(() => {
  switch (props.color) {
    case 'primary':
      return 'htw-bg-primary-500 htw-text-white dark:htw-text-black htw-border htw-border-primary-600 dark:htw-border-primary-400'
    case 'secondary':
      return 'htw-bg-gray-300 dark:htw-bg-gray-600 htw-border htw-border-gray-400 dark:htw-border-gray-500'
    case 'success':
      return 'htw-bg-emerald-300 dark:htw-bg-emerald-700 htw-border htw-border-emerald-400 dark:htw-border-emerald-600'
    case 'warning':
      return 'htw-bg-amber-300 dark:htw-bg-amber-700 htw-border htw-border-amber-400 dark:htw-border-amber-600'
    case 'error':
      return 'htw-bg-red-300 dark:htw-bg-red-700 htw-border htw-border-red-400 dark:htw-border-red-600'
  }
  return 'htw-bg-gray-200 htw-text-gray-800 dark:htw-bg-gray-700 dark:htw-text-gray-200 htw-border htw-border-gray-300 dark:htw-border-gray-600'
})
</script>

<template>
  <span
    class="histoire-base-tag htw-text-center htw-text-xs htw-mx-1 htw-pe-2 htw-h-5 htw-flex htw-items-center htw-justify-center htw-gap-1 htw-min-w-4 htw-rounded-full"
    :class="[
      colorClasses,
      icon ? 'htw-ps-1' : 'htw-ps-2',
    ] "
  >
    <Icon
      v-if="icon"
      :icon="icon"
    />
    <slot />
  </span>
</template>
