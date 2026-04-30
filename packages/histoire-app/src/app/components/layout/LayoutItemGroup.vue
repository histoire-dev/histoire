<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div role="group">
    <div
      role="heading"
      aria-level="3"
      class="htw-px-6 htw-pt-3 htw-pb-1 htw-text-xs htw-uppercase htw-tracking-wide htw-opacity-50"
    >
      {{ title }}
    </div>
    <slot />
  </div>
</template>
