<script lang="ts">
export default {
  name: 'HstButton',
}
</script>

<script setup lang="ts">
import { computed, withDefaults } from 'vue'

const props = withDefaults(defineProps<{
  primary?: boolean
  rounded?: boolean
}>(), {
  rounded: true,
})

const computedClasses = computed(() => {
  let classes = ''

  if (props.primary) {
    classes += 'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black'
  } else {
    classes += 'htw-bg-gray-100 dark:htw-bg-gray-800 htw-text-gray-900 dark:htw-text-gray-100 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900'
  }

  if (props.rounded) {
    classes += ' htw-rounded-sm'
  }

  return classes
})
</script>

<template>
  <button
    class="htw-p-2 htw-cursor-pointer"
    :class="computedClasses"
  >
    <slot />
  </button>
</template>
