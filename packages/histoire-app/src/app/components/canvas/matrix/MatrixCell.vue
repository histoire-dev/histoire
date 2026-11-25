<script setup lang="ts">
import type { MatrixCellData } from '../../../util/matrix.js'
import type { CanvasRect } from '../pan/usePanZoom.js'
import type { MatrixFrameLayout } from './matrix-layout.js'
import { HstButton, useLoadingDelay } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrameBackground, useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useContextMenu } from '../../../composables/context-menu.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { getBackgroundStyle } from '../../../util/background.js'
import { formatMatrixValue } from '../../../util/matrix-values.js'
import CanvasLoadingIndicator from '../CanvasLoadingIndicator.vue'
import CanvasReplicaPreview from '../CanvasReplicaPreview.vue'
import { isFrameMenuShortcut, openFrameMenu } from '../frame-menu.js'
import FramePaddingAligners from '../FramePaddingAligners.vue'
import { watchMatrixFrameRegistration } from './matrix-registration.js'

const props = defineProps<{
  /** Local Cartesian data and merged override set. */
  cell: MatrixCellData
  /** Track-sized card and intrinsic sandbox bounds. */
  frame: MatrixFrameLayout
  /** Cell coordinates at selection's candidate zoom, preserving fixed matrix gaps. */
  fitBounds?: (zoom: number) => CanvasRect
  /** Whether budget admits a passive preview document. */
  live: boolean
  /** Exact base variant used by every cell. */
  variantId: string
  /** Absolute first-party source URL. */
  previewBase: string
  /** Gutter around the variant inside the cell, in logical pixels. */
  padding?: number
  /** Story declares the variant size, so the document gets it instead of viewport settings. */
  fixedSize?: boolean
}>()
const canvas = useCanvasStore()
const background = useCanvasFrameBackground(() => props.frame.id)
const registry = useCanvasFrames()
const matrix = useMatrixStore()
const menu = useContextMenu()
const preview = ref<{ getSource: () => Promise<string>, retry: () => Promise<void> }>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadingVisible = useLoadingDelay(() => status.value === 'loading', () => props.frame.id)
const error = ref<unknown>()
const position = computed(() => ({ left: `${props.frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`, top: `${props.frame.y * canvas.effectiveZoom + canvas.panOffset.y}px`, width: `${props.frame.width * canvas.effectiveZoom}px`, height: `${props.frame.height * canvas.effectiveZoom}px` }))
const gutter = computed(() => props.padding ?? 0)
/** Variant bounds inside the gutter; measuring and comments target these. */
const inner = computed(() => props.frame.contentRect)
const contentStyle = computed(() => ({
  width: `${inner.value.width}px`,
  height: `${inner.value.height}px`,
  transform: `translate(${gutter.value * canvas.effectiveZoom}px, ${gutter.value * canvas.effectiveZoom}px) scale(${canvas.effectiveZoom})`,
}))
let releaseSource = () => {}
const unregister = watchMatrixFrameRegistration({ registry, getFrame: () => props.frame, getFitBounds: zoom => props.fitBounds?.(zoom) ?? props.frame, getVariantId: () => props.variantId, getPropsOverride: () => props.cell.props, onTargetChange: () => {
  releaseSource()
  releaseSource = () => {}
  status.value = 'loading'
  error.value = undefined
} })

/** Only ready admitted documents offer framework-generated source for copying. */
watch([() => props.live, status], ([live, value]) => {
  releaseSource()
  releaseSource = live && value === 'ready'
    ? matrix.registerSource(props.cell.key, async () => {
        if (!preview.value) throw new Error('Selected matrix cell is not ready')
        return preview.value.getSource()
      })
    : () => {}
})

/** Passive errors stay within this cell instead of changing canonical inspector. */
function updateStatus(value: typeof status.value, detail?: unknown): void {
  status.value = value
  error.value = detail
}

/** Native menu keys use same target capture as ordinary canvas frame chrome. */
function onKeyDown(event: KeyboardEvent): void {
  if (!isFrameMenuShortcut(event)) return
  openMenu(event)
}

/** Matrix menus preserve local and canonical selection while retaining cell props. */
function openMenu(event: MouseEvent | KeyboardEvent): void {
  openFrameMenu(menu, event, { storyId: props.frame.storyId, variantId: props.variantId, frameKey: props.frame.id })
}
onBeforeUnmount(() => {
  releaseSource()
  unregister()
})
</script>

<template>
  <section class="histoire-matrix-cell htw:absolute htw:overflow-hidden htw:border htw:border-solid htw:border-border htw:rounded-[7px] htw:bg-white htw:pointer-events-auto htw:data-[selected=true]:outline-2 htw:data-[selected=true]:outline-solid htw:data-[selected=true]:outline-accent htw:data-[selected=true]:-outline-offset-1" :style="{ ...position, ...getBackgroundStyle(background) }" :data-frame-id="frame.id" :data-selected="matrix.selectedCell.value?.key === cell.key" @contextmenu="openMenu">
    <div class="histoire-matrix-cell-content htw:origin-top-left" :style="contentStyle">
      <CanvasReplicaPreview v-if="live" :key="variantId" ref="preview" :frame-id="frame.id" :story-id="frame.storyId" :variant-id="variantId" :preview-base="previewBase" :props-override="cell.props" :viewport="fixedSize ? { width: inner.width, height: inner.height } : undefined" @status="updateStatus" />
    </div>
    <FramePaddingAligners v-if="gutter > 0" :width="inner.width * canvas.effectiveZoom" :height="inner.height * canvas.effectiveZoom" :padding="gutter * canvas.effectiveZoom" :background="background" />
    <button class="histoire-matrix-cell-select htw:absolute htw:inset-0 htw:w-full htw:m-0 htw:p-0 htw:border-0 htw:rounded-[inherit] htw:bg-transparent htw:cursor-pointer htw:[appearance:none] htw:focus-visible:outline-2 htw:focus-visible:outline-solid htw:focus-visible:outline-accent htw:focus-visible:-outline-offset-[3px]" type="button" :aria-label="`Select matrix cell ${formatMatrixValue(cell.row)} · ${formatMatrixValue(cell.col)}`" :aria-pressed="matrix.selectedCell.value?.key === cell.key" @click="matrix.selectCell(cell.key)" @keydown="onKeyDown" />
    <span v-if="!live" class="htw:absolute htw:inset-0 htw:grid htw:[place-content:center] htw:gap-2 htw:p-3 htw:text-muted htw:bg-input htw:text-[11px] htw:text-center htw:pointer-events-none">Not rendered</span>
    <div v-else-if="loadingVisible" class="histoire-matrix-cell-loading htw:absolute htw:inset-0 htw:grid htw:[place-content:center] htw:gap-2 htw:p-3 htw:text-muted htw:bg-input htw:text-[11px] htw:text-center htw:pointer-events-none" role="status" aria-label="Loading variant">
      <CanvasLoadingIndicator />
    </div>
    <div v-else-if="status === 'error'" class="htw:absolute htw:inset-0 htw:grid htw:[place-content:center] htw:gap-2 htw:p-3 htw:text-muted htw:bg-input htw:text-[11px] htw:text-center htw:pointer-events-none htw:text-danger htw:bg-danger-soft" role="alert">
      <span>{{ error instanceof Error ? error.message : 'Variant unavailable' }}</span>
      <HstButton class="htw:py-[3px] htw:px-2 htw:text-inherit htw:pointer-events-auto" color="default" type="button" @click="preview?.retry()">
        Retry
      </HstButton>
    </div>
  </section>
</template>
