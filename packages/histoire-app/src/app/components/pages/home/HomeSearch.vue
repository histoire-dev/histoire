<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Real catalog preview-story count. */
  stories: number
  /** Real documentation-only count. */
  guides: number
}>()
defineEmits<{
  /** Focus existing Search pane; this surface owns no duplicate search state. */
  search: []
}>()
</script>

<template>
  <HstButton type="button" class="histoire-home-search histoire-home-card" @click="$emit('search')">
    <BuiltinIcon icon="search" :size="16" />
    <span>Search {{ stories }} stories and {{ guides }} docs pages</span>
    <kbd>Ctrl K</kbd>
  </HstButton>
</template>

<style scoped>
.histoire-home-search { display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; padding: 14px 16px; color: var(--histoire-muted); }
.histoire-home-search span { flex: 1; }
.histoire-home-search kbd { border: 1px solid var(--histoire-border); border-radius: 5px; padding: 2px 5px; font-family: var(--histoire-font-mono, monospace); font-size: 10px; }
.histoire-home-search:hover { color: var(--histoire-text); }
</style>
