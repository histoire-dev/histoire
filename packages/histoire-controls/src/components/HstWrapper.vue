<script lang="ts">
export default {
  name: 'HstWrapper',
}
</script>

<script lang="ts" setup>
const props = defineProps<{
  title?: string
  reverse?: boolean
}>()
</script>

<template>
  <label
    class="htw-p-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-gap-2 htw-flex-wrap"
    :class="{'htw-flex-row-reverse': reverse}"
  >
    <span
      :title="title"
      class="htw-text-sm htw-w-28 htw-whitespace-nowrap htw-text-ellipsis htw-overflow-hidden htw-shrink-0"
      :class="{'htw-grow': reverse}"
    >
      {{ title }}
    </span>
    <span
      class="htw-block"
      :class="{'htw-grow': !reverse}"
    >
      <slot />
    </span>
  </label>
</template>
