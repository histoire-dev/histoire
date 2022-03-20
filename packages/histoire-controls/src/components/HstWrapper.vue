<script lang="ts">
import { VTooltip } from 'floating-vue'

export default {
  name: 'HstWrapper',

  directives: {
    tooltip: VTooltip,
  },
}
</script>

<script lang="ts" setup>
const props = defineProps<{
  title?: string
}>()
</script>

<template>
  <label class="htw-p-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-gap-2 htw-flex-wrap">
    <span
      v-tooltip="{
        content: title,
        placement: 'left',
        distance: 12,
      }"
      class="htw-text-sm htw-w-28 htw-whitespace-nowrap htw-text-ellipsis htw-overflow-hidden htw-shrink-0"
    >
      {{ title }}
    </span>
    <span class="htw-block htw-grow">
      <slot />
    </span>
  </label>
</template>
