<script lang="ts" setup>
import type { Story, Variant } from 'histoire'

const props = defineProps<{
  /** Story metadata controls opt-in example layout. */
  story: Story
  /** Variant metadata can disable diagnostic wrapper decoration. */
  variant?: Variant
}>()

/** Preserve diagnostic decoration outside explicitly styled examples. */
function hasWrapper() {
  return !props.story.meta?.exampleStage
    && props.story.meta?.wrapper !== false
    && props.variant?.meta?.wrapper !== false
}
</script>

<template>
  <div
    class="global-wrapper"
    :class="{ 'example-stage example-stack example-native': story.meta?.exampleStage }"
    :style="hasWrapper() ? 'padding: 0.25rem; border: solid 1px rgba(0, 0, 0, 0.05);' : ''"
  >
    <slot />
  </div>
</template>
