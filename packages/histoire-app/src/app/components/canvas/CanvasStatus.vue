<script setup lang="ts">
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Temporary pan mode includes Space without persisting tool change. */
  pan: boolean
}>()
const snapshot = useHistoireSnapshot()
const canvas = useCanvasStore()
const size = computed(() => {
  const value = snapshot.value.settings
  return value.rotate ? `${value.responsiveHeight ?? 'Auto'} × ${value.responsiveWidth}` : `${value.responsiveWidth} × ${value.responsiveHeight ?? 'Auto'}`
})
</script>

<template>
  <div class="histoire-canvas-info">
    <div v-if="pan" class="histoire-pan-hint" aria-live="polite">
      <strong>Panning</strong><span><kbd>Space</kbd> + drag</span><span>Middle mouse</span><span><kbd>H</kbd> hand tool</span><span><kbd>Shift + 1</kbd> recenter</span>
    </div>
    <div v-else class="histoire-canvas-status">
      <WorkbenchIcon name="laptop" :size="14" /><span>{{ size }} · {{ Math.round(canvas.effectiveZoom * 100) }}% · {{ snapshot.settings.backgroundColor }}</span>
    </div>
  </div>
</template>

<style scoped>
.histoire-canvas-info { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); bottom: 20px; display: flex; align-items: center; min-width: 0; container-type: inline-size; pointer-events: none; }
.histoire-canvas-status { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; font: 11px var(--histoire-font-mono, "JetBrains Mono", monospace); color: var(--histoire-muted); }
.histoire-canvas-status svg { flex: none; }
.histoire-canvas-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.histoire-pan-hint { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 14px; width: max-content; max-inline-size: 100%; margin-inline: auto; padding: 10px 14px; border: 1px solid var(--histoire-border); border-radius: 10px; background: var(--histoire-surface); color: var(--histoire-muted); font-size: 12px; white-space: nowrap; }
strong { color: var(--histoire-text); } kbd { font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); font-size: 11px; }
@container (max-width: 650px) { .histoire-pan-hint span:nth-last-child(-n+2) { display: none; } }
</style>
