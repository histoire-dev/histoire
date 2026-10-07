<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasFrameLayout } from './frame-layout.js'
import type { CanvasRect } from './pan/usePanZoom.js'
import { ref } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import CanvasFrame from './CanvasFrame.vue'
import { useSingleVariantZoom } from './useSingleVariantZoom.js'

const props = defineProps<{
  /** Unobstructed viewport area measured in parent CSS pixels. */
  area: CanvasRect
  /** Selected target only; no sibling admission or virtualization. */
  frame?: CanvasFrameLayout
  /** Selected collected variant metadata. */
  variant?: HistoireCatalogVariant
  /** Absolute owning book URL. */
  previewBase: string
  /** Collection failure leaves visible document inactive. */
  stale: boolean
}>()
const emit = defineEmits<{ contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout] }>()
const surface = ref<HTMLElement>()
useSingleVariantZoom(useCanvasStore(), surface, { area: () => props.area, size: () => props.frame, frameId: () => props.frame?.id })
</script>

<template>
  <div ref="surface" class="histoire-single-variant" :style="{ left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px` }">
    <CanvasFrame v-if="frame && variant" :key="frame.id" presentation="single" :frame="frame" :variant="variant" :live="true" :selected="true" :preview-base="previewBase" :width="frame.width" :height="frame.height" :stale="stale" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
    <WorkbenchEmptyState v-else icon="document" title="Select a variant" />
  </div>
</template>

<style scoped>
.histoire-single-variant { position: absolute; overflow: auto; touch-action: auto; }
.histoire-single-variant > .histoire-canvas-frame { margin-inline: auto; }
</style>
