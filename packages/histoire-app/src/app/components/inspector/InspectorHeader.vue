<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Selected story's catalog title. */
  storyTitle: string
  /** Selected variant title, absent when selection is unresolved. */
  variantTitle?: string
  /** Standalone adapter's isolated preview URL. */
  isolatedHref?: string
}>()
defineEmits<{ close: [] }>()
</script>

<template>
  <header class="inspector-header">
    <div class="inspector-header-titles">
      <span v-if="variantTitle && variantTitle !== storyTitle" class="inspector-story-title"><span>{{ storyTitle }}</span><WorkbenchIcon name="chevron-right" :size="12" /></span>
      <h2>{{ variantTitle || storyTitle }}</h2>
    </div>
    <a v-if="isolatedHref" :href="isolatedHref" target="_blank" rel="noopener noreferrer" class="inspector-icon-button" aria-label="Open isolated preview" title="Open isolated preview">
      <WorkbenchIcon name="launch" />
    </a>
    <HstButton color="flat" type="button" class="inspector-icon-button" aria-label="Close inspector" title="Close inspector" @click="$emit('close')">
      <WorkbenchIcon name="close" />
    </HstButton>
  </header>
</template>

<style scoped>
.inspector-header { display: flex; align-items: center; gap: 8px; padding: 16px 16px 14px; }
.inspector-header-titles { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.inspector-story-title { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 50%; color: var(--histoire-muted); font-size: 13px; white-space: nowrap; }
.inspector-story-title > span { overflow: hidden; text-overflow: ellipsis; }
.inspector-story-title > svg { flex: none; }
.inspector-header h2 { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 1.3; font-weight: 800; }
.inspector-icon-button { display: grid; place-items: center; flex: none; width: 28px; height: 28px; padding: 0; color: var(--histoire-muted); }
.inspector-icon-button:hover { background: var(--histoire-chip); color: var(--histoire-text); }
</style>
