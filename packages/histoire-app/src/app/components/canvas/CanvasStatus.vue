<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'

defineProps<{
  /** Temporary pan mode includes Space without persisting tool change. */
  pan: boolean
}>()
const snapshot = useHistoireSnapshot()
const canvas = useCanvasStore()
const size = computed(() => {
  if (canvas.arrangement === 'single') return `${canvas.singleViewportSize.width} × ${canvas.singleViewportSize.height}`
  const value = snapshot.value.settings
  return value.rotate ? `${value.responsiveHeight ?? 'Auto'} × ${value.responsiveWidth}` : `${value.responsiveWidth} × ${value.responsiveHeight ?? 'Auto'}`
})
</script>

<template>
  <div v-if="pan" class="histoire-canvas-info">
    <div class="histoire-pan-hint" aria-live="polite">
      <strong>Panning</strong><span><kbd>Space</kbd> + drag</span><span>Middle mouse</span><span><kbd>H</kbd> hand tool</span><span><kbd>Shift + 1</kbd> recenter</span>
    </div>
  </div>
  <div v-else class="histoire-canvas-status">
    <BuiltinIcon icon="laptop" :size="14" /><span>{{ size }} · {{ Math.round(canvas.effectiveZoom * 100) }}% · {{ snapshot.settings.backgroundColor }}</span>
  </div>
</template>

<style scoped>
/* Keep the pan hint above positioned frame chrome, including the selected frame ring. */
.histoire-canvas-info { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); bottom: 20px; display: flex; align-items: center; min-width: 0; container-type: inline-size; pointer-events: none; z-index: 4; }
.histoire-canvas-status { display: flex; inline-size: 100%; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; font: 11px var(--histoire-font-mono, "JetBrains Mono", monospace); color: var(--histoire-muted); }
.histoire-canvas-status svg { flex: none; }
.histoire-canvas-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.histoire-pan-hint { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 14px; width: max-content; max-inline-size: 100%; margin-inline: auto; padding: 10px 14px; border: 1px solid var(--histoire-border); border-radius: 10px; background: var(--histoire-surface); color: var(--histoire-muted); font-size: 12px; white-space: nowrap; }
strong { color: var(--histoire-text); } kbd { font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); font-size: 11px; }
@container (max-width: 650px) { .histoire-pan-hint span:nth-last-child(-n+2) { display: none; } }
</style>
