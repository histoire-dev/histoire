<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasFrameLayout } from './frame-layout.js'
import type { CanvasRect } from './pan/usePanZoom.js'
import { onBeforeUnmount, ref } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import CanvasFrame from './CanvasFrame.vue'
import SingleVariantResizeHandles from './SingleVariantResizeHandles.vue'
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
  /** Workbench chrome and selected variant allow direct frame sizing. */
  resizable: boolean
}>()
const emit = defineEmits<{ contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout], resize: [size: { width: number, height: number }] }>()
const surface = ref<HTMLElement>()
const frameShell = ref<HTMLElement>()
const resizing = ref(false)
const canvas = useCanvasStore()
useSingleVariantZoom(canvas, surface, { area: () => props.area, size: () => props.frame, frameId: () => props.frame?.id })

/** Freeze Responsive and Fit only after one effective direct-resize change. */
function startResize(): void {
  if (canvas.zoom === 'fit') canvas.setZoom(canvas.effectiveZoom)
  canvas.setSingleViewportMode('fixed')
}

/** Publish physical dimensions without touching canonical settings per pointer move. */
function resize(size: { width: number, height: number }): void {
  canvas.setSingleViewportDraft(size)
}

/** Let canonical settings publish synchronously before retiring transient geometry. */
function commit(size: { width: number, height: number }): void {
  emit('resize', size)
  canvas.setSingleViewportDraft(null)
}

onBeforeUnmount(() => canvas.setSingleViewportDraft(null))
</script>

<template>
  <div ref="surface" class="histoire-single-variant" :style="{ left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px` }">
    <div v-if="frame && variant" ref="frameShell" class="histoire-single-frame-shell" :class="{ 'is-resizing': resizing }">
      <CanvasFrame :key="frame.id" presentation="single" :frame="frame" :variant="variant" :live="true" :selected="true" :preview-base="previewBase" :width="frame.width" :height="frame.height" :stale="stale" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
      <SingleVariantResizeHandles v-if="resizable" :surface="surface" :frame="frameShell" :size="frame" :zoom="canvas.effectiveZoom" @update:active="resizing = $event" @start="startResize" @resize="resize" @commit="commit" />
    </div>
    <WorkbenchEmptyState v-else icon="document" title="Select a variant" />
  </div>
</template>

<style scoped>
.histoire-single-variant { position: absolute; overflow: auto; touch-action: auto; }
.histoire-single-frame-shell { position: relative; width: fit-content; margin-inline: auto; }
.histoire-single-frame-shell.is-resizing :deep(iframe) { pointer-events: none; }
</style>
