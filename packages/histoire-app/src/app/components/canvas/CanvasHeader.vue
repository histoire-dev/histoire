<script setup lang="ts">
import type { HistoireCatalogStory } from '@histoire/sdk'
import { BuiltinIcon } from '@histoire/controls/vue'
import { isHistoireProjectFileOrigin } from '@histoire/protocol'
import { computed } from 'vue'
import CanvasStatus from './CanvasStatus.vue'

const props = withDefaults(defineProps<{
  /** Selected portable story metadata. */
  story: HistoireCatalogStory
  /** Whether the current story can be opened through the development editor. */
  canOpenInEditor?: boolean
}>(), { canOpenInEditor: false })
const emit = defineEmits<{ openInEditor: [] }>()
const editorLabel = computed(() => `Open ${props.story.relativePath ?? ''} in editor`)
const showFile = computed(() => !!props.story.relativePath && isHistoireProjectFileOrigin(props.story.fileOrigin))
</script>

<template>
  <header class="histoire-canvas-heading">
    <div><h1>{{ story.title }}</h1><span>{{ story.variants.length }} {{ story.variants.length === 1 ? 'variant' : 'variants' }}</span></div>
    <div class="histoire-canvas-metadata">
      <button v-if="showFile && canOpenInEditor" type="button" class="histoire-canvas-file histoire-canvas-file-action" :aria-label="editorLabel" :title="editorLabel" @pointerdown.stop @click="emit('openInEditor')">
        <BuiltinIcon class="histoire-canvas-file-icon" icon="code" :size="14" />
        <span>{{ story.relativePath }}</span>
      </button>
      <span v-else-if="showFile" class="histoire-canvas-file"><BuiltinIcon icon="code" :size="14" /><span>{{ story.relativePath }}</span></span>
      <CanvasStatus :pan="false" />
    </div>
  </header>
</template>

<style scoped>
.histoire-canvas-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.histoire-canvas-heading > div { display: flex; flex: 1; align-items: baseline; gap: 12px; min-width: 0; }
/* Fixed canvas chrome reserves one title line before the matrix axis controls. */
h1 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; font-size: 24px; font-weight: 800; line-height: 1.2; letter-spacing: -.02em; color: var(--histoire-text); }
span { color: var(--histoire-muted); font-size: 12px; }
.histoire-canvas-heading > div > span { flex-shrink: 0; white-space: nowrap; }
.histoire-canvas-heading > .histoire-canvas-metadata { display: flex; flex: 0 1 45%; flex-direction: column; align-self: flex-start; align-items: stretch; gap: 3px; min-width: 0; }
.histoire-canvas-file { display: flex; inline-size: 100%; min-width: 0; align-items: center; justify-content: flex-end; gap: 8px; overflow: hidden; white-space: nowrap; font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); }
.histoire-canvas-file > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.histoire-canvas-file-action { box-sizing: border-box; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; pointer-events: auto; }
.histoire-canvas-file-icon { color: var(--histoire-muted); }
.histoire-canvas-file-action:hover .histoire-canvas-file-icon { color: var(--histoire-accent); }
.histoire-canvas-file-action:hover > span { color: var(--histoire-accent); }
.histoire-canvas-file-action:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
@container (max-width: 640px) { .histoire-canvas-file { display: none; } }
</style>
