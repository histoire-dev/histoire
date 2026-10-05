<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

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
  <HstButton color="flat" type="button" class="histoire-home-search" @click="$emit('search')">
    <WorkbenchIcon name="search" />
    <span>Search {{ stories }} stories and {{ guides }} docs pages</span>
    <kbd>Ctrl K</kbd>
  </HstButton>
</template>

<style scoped>
.histoire-home-search { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px 18px; color: var(--histoire-muted); text-align: left; }
.histoire-home-search span { flex: 1; }
.histoire-home-search kbd { border: 1px solid var(--histoire-border); border-radius: 5px; padding: 2px 5px; font-family: var(--histoire-font-mono, monospace); font-size: 10px; }
.histoire-home-search:hover { border-color: var(--histoire-accent); }
.histoire-home-search:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 3px; }
</style>
