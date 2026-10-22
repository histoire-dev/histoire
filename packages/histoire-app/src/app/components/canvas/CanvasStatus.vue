<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import CanvasMeasureHint from './CanvasMeasureHint.vue'
import { useCanvasViewportDimensions } from './toolbar/viewport-size.js'

defineProps<{
  /** Floating tool hint instead of the status line; pan covers temporary Space panning. */
  hint?: 'pan' | 'measure'
}>()
const snapshot = useHistoireSnapshot()
const canvas = useCanvasStore()
const dimensions = useCanvasViewportDimensions()
const size = computed(() => `${dimensions.value.width} × ${dimensions.value.height ?? 'Auto'}`)
</script>

<template>
  <div v-if="hint" class="histoire-canvas-info">
    <div v-if="hint === 'pan'" class="histoire-canvas-hint" aria-live="polite">
      <span class="canvas-hint-title"><BuiltinIcon icon="move" :size="14" />Panning</span>
      <span class="canvas-hint-item"><kbd>Space</kbd> + drag</span>
      <span class="canvas-hint-item">Middle mouse</span>
      <span class="canvas-hint-item"><kbd>H</kbd> hand tool</span>
      <span class="canvas-hint-item"><kbd>Shift + 1</kbd> recenter</span>
    </div>
    <CanvasMeasureHint v-else-if="canvas.measure?.locked" class="histoire-canvas-hint" />
    <div v-else class="histoire-canvas-hint" aria-live="polite">
      <span class="canvas-hint-title"><BuiltinIcon icon="ruler" :size="14" />Measuring</span>
      <span class="canvas-hint-item">Click to lock</span>
      <span class="canvas-hint-item">Lock, then <kbd>⇧</kbd> + hover compare</span>
    </div>
  </div>
  <div v-else class="histoire-canvas-status">
    <BuiltinIcon icon="laptop" :size="14" /><span>{{ size }} · {{ Math.round(canvas.effectiveZoom * 100) }}% · {{ snapshot.settings.backgroundColor }}</span>
  </div>
</template>

<style scoped>
/* Keep tool hints above positioned frame chrome, including the selected frame ring. */
.histoire-canvas-info { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); bottom: 20px; display: flex; align-items: center; min-width: 0; container-type: inline-size; pointer-events: none; z-index: 4; }
.histoire-canvas-status { display: flex; inline-size: 100%; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; font: 11px var(--histoire-font-mono, "JetBrains Mono", monospace); color: var(--histoire-muted); }
.histoire-canvas-status svg { flex: none; }
.histoire-canvas-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Shared tool hint look (pan, measure, locked measure toolbar): title chip matches the pressed toolbar button. */
.histoire-canvas-hint { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px; width: max-content; max-inline-size: 100%; margin-inline: auto; padding: 6px; border: 1px solid var(--histoire-border); border-radius: 10px; background: var(--histoire-surface); box-shadow: var(--histoire-shadow-canvas-toolbar); color: var(--histoire-muted); font-size: 12px; white-space: nowrap; }
/* Every hint entry shares the 24px toolbar button box so text, icons and keys line up across hints. */
.histoire-canvas-hint :deep(:is(.canvas-hint-title, .canvas-hint-item)) { display: inline-flex; align-items: center; gap: 4px; box-sizing: border-box; height: 24px; padding: 0 7px; border: 1px solid transparent; border-radius: 6px; line-height: 16px; }
.histoire-canvas-hint :deep(.canvas-hint-title) { background: var(--histoire-chip); color: var(--histoire-text); }
.histoire-canvas-hint :deep(kbd) { display: inline-block; padding: 0 4px; border: 1px solid var(--histoire-border); border-radius: 4px; font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); font-size: 11px; line-height: 14px; }
/* Narrow canvas keeps the label and first two hints. */
@container (max-width: 650px) { .histoire-canvas-hint > span:nth-child(n+4) { display: none; } }
</style>
