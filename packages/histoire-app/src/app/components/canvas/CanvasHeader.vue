<script setup lang="ts">
import type { HistoireCatalogStory } from '@histoire/sdk'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Selected portable story metadata. */
  story: HistoireCatalogStory
}>()
</script>

<template>
  <header class="histoire-canvas-heading">
    <div><h1>{{ story.title }}</h1><span>{{ story.variants.length }} {{ story.variants.length === 1 ? 'variant' : 'variants' }}</span></div>
    <span v-if="story.relativePath" class="histoire-canvas-file"><WorkbenchIcon name="code" :size="14" /><span>{{ story.relativePath }}</span></span>
  </header>
</template>

<style scoped>
.histoire-canvas-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.histoire-canvas-heading > div { display: flex; flex: 1; align-items: baseline; gap: 12px; min-width: 0; }
/* Fixed canvas chrome reserves one title line before the matrix axis controls. */
h1 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; font-size: 24px; font-weight: 800; line-height: 1.2; letter-spacing: -.02em; color: var(--histoire-text); }
span { color: var(--histoire-muted); font-size: 12px; }
.histoire-canvas-heading > div > span { flex-shrink: 0; white-space: nowrap; }
.histoire-canvas-file { display: flex; flex: 0 1 45%; min-width: 0; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); }
.histoire-canvas-file > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@container (max-width: 640px) { .histoire-canvas-file { display: none; } }
</style>
