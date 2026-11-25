<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import CanvasHintBar from './CanvasHintBar.vue'
import CanvasHintItem from './CanvasHintItem.vue'
import CanvasHintKey from './CanvasHintKey.vue'
import CanvasMeasureHint from './CanvasMeasureHint.vue'
import { useCanvasViewportDimensions, useStoryFrameSize } from './toolbar/viewport-size.js'

defineProps<{
  /** Floating tool hint instead of the status line; pan covers temporary Space panning. */
  hint?: 'pan' | 'measure'
}>()
const snapshot = useHistoireSnapshot()
const canvas = useCanvasStore()
const dimensions = useCanvasViewportDimensions()
const declared = useStoryFrameSize()
const size = computed(() => {
  const width = (canvas.autoFitContent ? undefined : declared.value?.width) ?? dimensions.value.width
  const height = (canvas.autoFitContent ? undefined : declared.value?.height) ?? dimensions.value.height
  return `${width} × ${height ?? 'Auto'}`
})
</script>

<template>
  <div v-if="hint" class="histoire-canvas-info htw:absolute htw:start-(--histoire-canvas-info-inset) htw:end-[calc(var(--histoire-canvas-inspector-reserve)+var(--histoire-canvas-info-inset))] htw:bottom-5 htw:flex htw:items-center htw:min-w-0 htw:@container/canvas-status htw:pointer-events-none htw:z-[4]">
    <CanvasHintBar v-if="hint === 'pan'" aria-live="polite">
      <CanvasHintItem title>
        <BuiltinIcon icon="move" :size="14" />Panning
      </CanvasHintItem>
      <CanvasHintItem><CanvasHintKey>Space</CanvasHintKey> + drag</CanvasHintItem>
      <CanvasHintItem>Middle mouse</CanvasHintItem>
      <CanvasHintItem secondary>
        <CanvasHintKey>H</CanvasHintKey> hand tool
      </CanvasHintItem>
      <CanvasHintItem secondary>
        <CanvasHintKey>Shift + 1</CanvasHintKey> recenter
      </CanvasHintItem>
    </CanvasHintBar>
    <CanvasMeasureHint v-else-if="canvas.measure?.locked" />
    <CanvasHintBar v-else aria-live="polite">
      <CanvasHintItem title>
        <BuiltinIcon icon="ruler" :size="14" />Measuring
      </CanvasHintItem>
      <CanvasHintItem>Click to lock</CanvasHintItem>
      <CanvasHintItem>Lock, then <CanvasHintKey>⇧</CanvasHintKey> + hover compare</CanvasHintItem>
    </CanvasHintBar>
  </div>
  <div v-else class="histoire-canvas-status htw:[line-height:normal] htw:flex htw:w-full htw:items-center htw:justify-end htw:gap-2 htw:min-w-0 htw:font-mono htw:text-[11px] htw:text-muted">
    <BuiltinIcon class="htw:flex-none" :icon="declared ? 'code' : 'laptop'" :size="14" /><span class="htw:overflow-hidden htw:text-ellipsis htw:whitespace-nowrap">{{ size }} · {{ Math.round(canvas.effectiveZoom * 100) }}% · {{ snapshot.settings.backgroundColor }}</span>
  </div>
</template>
