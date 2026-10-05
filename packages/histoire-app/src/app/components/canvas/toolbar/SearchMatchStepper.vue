<script setup lang="ts">
import ToolbarButton from './ToolbarButton.vue'

defineProps<{
  /** Exact current-story matching frames; matrix tuples are excluded. */
  count: number
  /** Reveal cursor position; zero means canonical frame does not match. */
  position: number
}>()
const emit = defineEmits<{
  /** Reveal previous matching frame without canonical activation. */
  previous: []
  /** Reveal next matching frame without canonical activation. */
  next: []
}>()
</script>

<template>
  <span v-if="count > 0" class="search-match-stepper">
    <ToolbarButton label="Previous search match" icon="chevron-up" @click="emit('previous')" />
    <span class="search-match-count" role="status" aria-label="Search matches" aria-live="polite">{{ position }} / {{ count }}</span>
    <ToolbarButton label="Next search match" icon="chevron-down" @click="emit('next')" />
  </span>
</template>

<style scoped>
.search-match-stepper { display: flex; align-items: center; flex: none; gap: 2px; }
.search-match-count { min-width: 36px; color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); text-align: center; white-space: nowrap; }
</style>
