<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasFrameLayout } from './frame-layout.js'
import type { CanvasRect } from './pan/usePanZoom.js'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useCanvasStore } from '../../composables/canvas-settings.js'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import CanvasFrame from './CanvasFrame.vue'
import SingleVariantResizeHandles from './SingleVariantResizeHandles.vue'
import { useSingleVariantPan } from './useSingleVariantPan.js'
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
  /** Story gutter around the variant, in logical pixels. */
  padding?: number
}>()
const emit = defineEmits<{ contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout], resize: [size: { width: number, height: number }] }>()
const surface = ref<HTMLElement>()
const frameShell = ref<HTMLElement>()
const resizing = ref(false)
const canvas = useCanvasStore()
const gutter = computed(() => props.padding ?? 0)
/** Zoom and pan own the whole frame, gutter included. */
const outerSize = computed(() => props.frame && { width: props.frame.width + gutter.value * 2, height: props.frame.height + gutter.value * 2 })
useSingleVariantZoom(canvas, surface, { area: () => props.area, size: () => outerSize.value, frameId: () => props.frame?.id })
const pan = useSingleVariantPan(surface, { area: () => props.area, size: () => outerSize.value, zoom: () => canvas.effectiveZoom, resizing: () => resizing.value })
defineExpose(pan)

/** Freeze Responsive and Fit only after one effective direct-resize change. */
function startResize(): void {
  if (canvas.zoom === 'fit') canvas.setZoom(canvas.effectiveZoom)
  const size = props.frame && { width: props.frame.width, height: props.frame.height }
  canvas.setSingleViewportMode('fixed')
  if (canvas.autoFitContent && size) canvas.setSingleViewportDraft(size)
  canvas.setAutoFitContent(false)
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
  <div class="htw:absolute htw:overflow-clip htw:[overflow-clip-margin:13px]" :style="{ left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px` }">
    <div ref="surface" class="histoire-single-variant htw:absolute htw:inset-0 htw:overflow-auto htw:touch-auto">
      <div v-if="frame && variant" ref="frameShell" class="histoire-single-frame-shell htw:relative htw:w-fit htw:mx-auto">
        <CanvasFrame :key="JSON.stringify([previewBase, frame.storyId])" presentation="single" :dragging="resizing" :frame="frame" :variant="variant" :live="true" :selected="true" :preview-base="previewBase" :width="frame.width" :height="frame.height" :padding="gutter" :stale="stale" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
      </div>
      <WorkbenchEmptyState v-else icon="document" title="Select a variant" />
    </div>
    <!-- Outside hit areas must stay out of native scroll content. -->
    <SingleVariantResizeHandles v-if="resizable && frame && variant" :surface="surface" :frame="frameShell" :size="frame" :inset="gutter" :zoom="canvas.effectiveZoom" @update:active="resizing = $event" @start="startResize" @resize="resize" @commit="commit" />
  </div>
</template>
