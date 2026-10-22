<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { isContextMenuShortcut } from '../../composables/context-menu.js'

defineProps<{
  /** Selected story's catalog title. */
  storyTitle: string
  /** Selected variant title, absent when selection is unresolved. */
  variantTitle?: string
  /** Standalone adapter's isolated preview URL. */
  isolatedHref?: string
}>()
const emit = defineEmits<{ close: [], contextmenu: [event: MouseEvent | KeyboardEvent] }>()

/** Header actions expose their story context menu to keyboard users. */
function onKeydown(event: KeyboardEvent): void {
  if (isContextMenuShortcut(event)) emit('contextmenu', event)
}
</script>

<template>
  <header class="inspector-header" @contextmenu="$emit('contextmenu', $event)" @keydown="onKeydown">
    <div class="inspector-header-titles">
      <span v-if="variantTitle && variantTitle !== storyTitle" class="inspector-story-title"><span>{{ storyTitle }}</span><BuiltinIcon icon="chevron-right" :size="12" /></span>
      <h2>{{ variantTitle || storyTitle }}</h2>
    </div>
    <a v-if="isolatedHref" :href="isolatedHref" target="_blank" rel="noopener noreferrer" class="inspector-icon-button histoire-icon-button" aria-label="Open in new tab" title="Open in new tab">
      <BuiltinIcon icon="launch" :size="16" />
    </a>
    <HstButton icon-only color="flat" type="button" class="inspector-icon-button" aria-label="Close inspector" title="Close inspector" @click="$emit('close')">
      <BuiltinIcon icon="close" :size="16" />
    </HstButton>
  </header>
</template>

<style scoped>
.inspector-header { display: flex; flex: none; align-items: center; gap: 8px; box-sizing: border-box; height: var(--histoire-pane-header-height); padding: 0 var(--histoire-inspector-gutter); }
.inspector-header-titles { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.inspector-story-title { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 50%; color: var(--histoire-muted); font-size: 13px; white-space: nowrap; }
.inspector-story-title > span { overflow: hidden; text-overflow: ellipsis; }
.inspector-story-title > svg { flex: none; }
.inspector-header h2 { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 1.3; font-weight: 800; }
.inspector-icon-button { --histoire-icon-button-size: 28px; color: var(--histoire-muted); }
.inspector-icon-button:hover { background: var(--histoire-chip); color: var(--histoire-text); }
</style>
