<script lang="ts" setup>
import type { Story, Variant } from 'histoire'

const props = defineProps<{
  story: Story
  variant?: Variant
}>()

function hasWrapper() {
  return props.story.meta?.wrapper !== false
    && props.variant?.meta?.wrapper !== false
}
</script>

<template>
  <div
    class="global-wrapper"
    :style="hasWrapper() ? 'padding: 0.25rem; border: solid 1px rgba(0, 0, 0, 0.05);' : ''"
  >
    <slot />
  </div>
</template>
