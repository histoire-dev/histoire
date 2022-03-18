<script lang="ts">
export default {
  name: 'HstWrapper',
}
</script>

<script lang="ts" setup>
const props = defineProps<{
  title?: string
}>()
</script>

<template>
  <label class="htw-p-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-gap-2">
    <span
      :title="title"
      class="htw-text-sm htw-w-32 htw-whitespace-nowrap htw-text-ellipsis htw-overflow-hidden htw-shrink-0"
    >
      {{ title }}
    </span>
    <slot />
  </label>
</template>
