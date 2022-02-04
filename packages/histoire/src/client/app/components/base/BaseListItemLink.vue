<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  inheritAttrs: false,
})
</script>

<template>
  <RouterLink
    v-bind="$attrs"
    class="htw-px-4 htw-py-2 htw-flex htw-space-x-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900"
    active-class="htw-bg-primary-500 hover:htw-bg-primary-600 dark:hover:htw-bg-primary-400 htw-text-white htw-font-bold"
  >
    <slot />
  </RouterLink>
</template>
