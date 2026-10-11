<script setup lang="ts">
import type { VisualSizing, VisualView } from './viewer-types.js'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import { restoreVisualViewerFocus, trapVisualViewerFocus } from './viewer-focus.js'
import VisualImageLabel from './VisualImageLabel.vue'
import VisualSlider from './VisualSlider.vue'
import VisualViewerActions from './VisualViewerActions.vue'
import VisualViewerDock from './VisualViewerDock.vue'
import VisualViewerHeader from './VisualViewerHeader.vue'
import { clampVisualZoom, fitVisualZoom } from './zoom.js'

const model = useWorkbenchVisual()!
const result = model.selectedResult
const snapshot = useHistoireSnapshot()
const storyTitle = computed(() => snapshot.value.catalog.stories.find(story => story.id === result.value?.case.storyId)?.title ?? result.value?.case.storyId)
const root = ref<HTMLElement>()
const board = ref<HTMLElement>()
const view = ref<VisualView>('slider')
const opacity = ref(50)
const zoom = ref(1)
/** `auto` shrinks large images to fit, `fit` also enlarges small ones, `manual` keeps user zoom. */
const sizing = ref<VisualSizing>('auto')
const id = useId()
let restore: HTMLElement | null = null
let observer: ResizeObserver | undefined
let pan: { element: HTMLElement, x: number, y: number, left: number, top: number } | undefined
const index = computed(() => model.results.value.findIndex(item => item.id === result.value?.id))
const images = computed(() => view.value === 'diff' ? ['diff'] as const : ['baseline', 'current'] as const)
/** Failed captures replace empty image board and own their recovery action. */
const captureFailed = computed(() => !!result.value && !result.value.images.current && (result.value.status === 'error' || !!result.value.error))
/** Opaque artifacts are served by existing generation-owned same-origin router. */
function imageUrl(kind: 'baseline' | 'current' | 'diff'): string | undefined {
  const name = result.value?.images[kind]
  return name ? `${import.meta.env.BASE_URL}__histoire/visual/${result.value?.artifactRunId ?? model.run.value?.id}/${name}` : undefined
}
/** Zoom uses actual dimensions, preserving mismatch rather than resizing images. */
function imageStyle(kind: 'baseline' | 'current' | 'diff') {
  const dimensions = kind === 'baseline' ? result.value?.baselineDimensions : result.value?.currentDimensions
  return { width: `${(dimensions?.width ?? 0) * zoom.value}px`, height: `${(dimensions?.height ?? 0) * zoom.value}px` }
}
/** Recompute shared baseline/current scale from measured image pane unless user zoomed manually. */
function applySizing(): void {
  if (sizing.value === 'manual') {
    return
  }
  const pane = board.value?.querySelector<HTMLElement>('.image-scroll')
  const dimensions = [result.value?.baselineDimensions, result.value?.currentDimensions].filter(size => !!size)
  if (!pane) return
  // Padding reserves shadow space inside the real scroll pane, outside fitted image pixels.
  const style = getComputedStyle(pane)
  const width = pane.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  const height = pane.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)
  const next = fitVisualZoom({ width, height }, dimensions, sizing.value === 'fit')
  if (next) {
    zoom.value = next
  }
}
/** Fit fills pane, enlarging small images; stays fitted across resizes and results. */
function fit(): void {
  sizing.value = 'fit'
  applySizing()
}
/** Manual zoom step; Reset passes no factor to return to natural size. */
function setZoom(factor?: number): void {
  sizing.value = 'manual'
  zoom.value = factor ? clampVisualZoom(zoom.value * factor) : 1
}
/** Result paging remains inside run, without changing story selection. */
function move(direction: number): void {
  const next = model.results.value[index.value + direction]
  if (next) {
    root.value?.focus({ preventScroll: true })
    model.selectedResultId.value = next.id
  }
}
/** Dismiss restores original trigger when it still belongs to live DOM. */
function close(): void {
  model.viewerOpen.value = false
  if (root.value) restoreVisualViewerFocus(root.value.ownerDocument, restore)
}
/** Keep keyboard owner stable while approval removes or disables its trigger. */
async function approve(): Promise<void> {
  const selected = result.value
  if (!selected) return
  root.value?.focus({ preventScroll: true })
  await model.approve([selected.id])
}
/** Retry keeps focus inside dialog when successful capture removes error actions. */
async function rerun(): Promise<void> {
  const selected = result.value
  if (!selected) return
  root.value?.focus({ preventScroll: true })
  await model.rerun(selected)
}
/** Equal images share scroll positions; different dimensions keep independent pixel geometry. */
function synchronize(event: Event): void {
  if (view.value !== 'pair' || !board.value || result.value?.baselineDimensions?.width !== result.value?.currentDimensions?.width || result.value?.baselineDimensions?.height !== result.value?.currentDimensions?.height) {
    return
  }
  const source = event.currentTarget as HTMLElement
  for (const pane of board.value.querySelectorAll<HTMLElement>('.image-scroll')) {
    if (pane !== source) {
      pane.scrollLeft = source.scrollLeft
      pane.scrollTop = source.scrollTop
    }
  }
}
/** Pointer dragging pans image buffers, not live story canvas. */
function startPan(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  const element = event.currentTarget as HTMLElement
  pan = { element, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
  element.setPointerCapture(event.pointerId)
  event.preventDefault()
}
/** Pointer movement stays inside captured review scroll owner. */
function movePan(event: PointerEvent): void {
  if (!pan) {
    return
  }
  pan.element.scrollLeft = pan.left - event.clientX + pan.x
  pan.element.scrollTop = pan.top - event.clientY + pan.y
}
/** Escape closes review; Tab retains keyboard focus inside viewer controls. */
function keyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  else
    if (root.value) {
      trapVisualViewerFocus(event, root.value)
    }
}
watch([result, view], () => {
  if ((view.value === 'diff' && !result.value?.images.diff) || (['overlay', 'slider'].includes(view.value) && !result.value?.images.baseline)) view.value = 'pair'
  void nextTick(applySizing)
}, { immediate: true })
onMounted(() => {
  restore = root.value?.ownerDocument.activeElement as HTMLElement | null
  root.value?.focus()
  observer = new ResizeObserver(applySizing)
  if (board.value) {
    observer.observe(board.value)
  }
  applySizing()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (root.value) restoreVisualViewerFocus(root.value.ownerDocument, restore)
})
</script>

<template>
  <section ref="root" class="visual-viewer" role="dialog" aria-modal="false" :aria-labelledby="`${id}-title`" tabindex="-1" @keydown="keyboard">
    <VisualViewerHeader :title-id="`${id}-title`" :title="result?.case.kind === 'matrix' ? `${storyTitle} › ${result.case.label}` : result?.case.label ?? 'Visual results'" :index="index" :capture-failed="captureFailed" @move="move" @close="close" />
    <div ref="board" class="image-board" :data-view="view">
      <figure v-if="result?.images.current && (view === 'slider' || view === 'overlay')">
        <div class="image-scroll" tabindex="0" aria-label="Pan compared images" @pointerdown="startPan" @pointermove="movePan" @pointerup="pan = undefined" @lostpointercapture="pan = undefined">
          <div class="image-frame">
            <template v-if="view === 'slider'">
              <VisualImageLabel label="Baseline" />
              <VisualImageLabel label="Current" right />
              <VisualSlider class="image-stage" :baseline-url="imageUrl('baseline')" :current-url="imageUrl('current')" :baseline-style="imageStyle('baseline')" :current-style="imageStyle('current')" :label="result.case.label" />
            </template>
            <template v-else>
              <VisualImageLabel label="Overlay" />
              <div class="image-stage overlay-stage">
                <img :src="imageUrl('baseline')" :alt="`baseline image for ${result.case.label}`" :style="imageStyle('baseline')" draggable="false">
                <img :src="imageUrl('current')" :alt="`current image for ${result.case.label}`" :style="[imageStyle('current'), { opacity: opacity / 100 }]" draggable="false">
              </div>
            </template>
          </div>
        </div>
      </figure>
      <template v-else-if="result?.images.current">
        <figure v-for="kind in images" :key="kind" :data-kind="kind">
          <div class="image-scroll" tabindex="0" :aria-label="`Pan ${kind} image`" @scroll="synchronize" @pointerdown="startPan" @pointermove="movePan" @pointerup="pan = undefined" @lostpointercapture="pan = undefined">
            <div v-if="imageUrl(kind)" class="image-frame">
              <VisualImageLabel :label="kind === 'baseline' ? 'Baseline' : kind === 'current' ? 'Current' : 'Diff'" :dimensions="kind === 'baseline' ? result.baselineDimensions : undefined" />
              <div class="image-stage">
                <img :src="imageUrl(kind)" :alt="`${kind} image for ${result.case.label}`" :style="imageStyle(kind)" draggable="false">
              </div>
            </div>
            <WorkbenchEmptyState v-else icon="camera" title="No baseline" />
          </div>
        </figure>
      </template>
      <WorkbenchErrorState v-else-if="captureFailed" title="Screenshot failed">
        <template v-if="result?.error" #default>
          {{ result.error }}
        </template>
        <template #actions>
          <HstButton color="flat" :disabled="!!model.requestId.value || (result && model.approvalPending(result))" @click="rerun">
            Run again
          </HstButton>
        </template>
      </WorkbenchErrorState>
      <WorkbenchEmptyState v-else icon="camera" title="No captured image" />
    </div>
    <div class="bottom-controls">
      <VisualViewerDock v-model:view="view" v-model:opacity="opacity" :zoom="zoom" :sizing="sizing" @zoom="setZoom" @fit="fit" />
      <VisualViewerActions :capture-failed="captureFailed" @approve="approve" @rerun="rerun" />
    </div>
  </section>
</template>

<style scoped>
.visual-viewer { position: absolute; inset: 12px; z-index: 100; display: flex; flex-direction: column; min-width: 0; min-height: 0; background-color: var(--histoire-canvas); background-image: radial-gradient(color-mix(in srgb, var(--histoire-muted) 18%, transparent) 1px, transparent 1px); background-size: 18px 18px; color: var(--histoire-text); border: 1px solid var(--histoire-border); border-radius: 16px; box-shadow: var(--histoire-shadow-panel); overflow: hidden; container-type: inline-size; }
.visual-viewer :deep(.viewer-float) { background: var(--viewer-float-background, rgb(var(--histoire-surface-rgb) / 88%)); border: 1px solid var(--histoire-border); border-radius: 12px; box-shadow: var(--histoire-shadow-popover); backdrop-filter: blur(10px); }
.image-board { display: flex; flex: 1; min-height: 0; gap: 16px; padding: 0 24px; overflow: hidden; }
figure { display: flex; flex: 1; margin: 0; min-width: 0; min-height: 0; }
.image-scroll { display: flex; flex: 1; overflow: auto; min-width: 0; min-height: 0; padding: 36px 24px 24px; cursor: grab; touch-action: none; }.image-scroll:active { cursor: grabbing; }
/* Auto margins center fitted images, but collapse to zero for reachable overflow during manual zoom. */
.image-frame { position: relative; flex: none; margin: auto; }
/* Clip rounds images without creating a scroll owner that would break the slider's sticky grip. */
.image-stage { position: relative; flex: none; width: max-content; height: max-content; border-radius: 6px; overflow: clip; box-shadow: 0 24px 64px rgb(0 0 0 / 35%); }
img { display: block; max-width: none; user-select: none; }.overlay-stage { display: grid; }.overlay-stage img { grid-area: 1/1; }
.image-board > :deep(.workbench-state), .image-scroll > :deep(.workbench-state) { flex: 1; min-width: 0; overflow: auto; }
/* Controls occupy transparent flow rows so their actual wrapped height stays outside Fit's measured pane. */
.bottom-controls { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; gap: 12px; padding: 8px 14px 14px; }.bottom-controls :deep(.viewer-dock) { grid-column: 2; }.bottom-controls :deep(.viewer-actions) { grid-column: 3; justify-self: end; }
@container (max-width: 1200px) { .bottom-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; }.bottom-controls :deep(.viewer-actions) { margin-left: auto; } }
@container (max-width: 640px) { .image-board { padding: 0; gap: 4px; }.image-scroll { padding: 32px 12px 12px; }.bottom-controls { flex-direction: column; gap: 8px; padding: 8px 10px 10px; }.bottom-controls :deep(.viewer-actions) { margin-left: 0; } }
</style>
