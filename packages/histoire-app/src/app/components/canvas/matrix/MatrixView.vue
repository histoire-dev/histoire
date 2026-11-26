<script setup lang="ts">
import type { CanvasContentInsets } from '../../../stores/canvas.js'
import type { MatrixCellData } from '../../../util/matrix.js'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useCanvasStore } from '../../../composables/canvas-settings.js'
import { useSelection } from '../../../composables/selection.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { filterMatrixValues } from '../../../util/matrix.js'
import { canvasContentKey } from '../content-sizes.js'
import { useCanvasFrameAdmission } from '../frame-admission.js'
import { useCanvasFrameLedger } from '../frames/frame-ledger.js'
import { canvasContentRect, clientToCanvas } from '../pan/usePanZoom.js'
import { layoutMatrixFrames, MATRIX_COLUMN_HEADER, MATRIX_ROW_GUTTER, MATRIX_TOP_INSET, matrixLayoutBounds } from './matrix-layout.js'
import { watchMatrixFrameSelection } from './matrix-selection.js'
import MatrixAvailabilityState from './MatrixAvailabilityState.vue'
import MatrixAxisBar from './MatrixAxisBar.vue'
import MatrixCell from './MatrixCell.vue'

const props = defineProps<{
  /** URL row axis, validated against available finite props. */
  rows?: string
  /** URL column axis, validated independently of row. */
  cols?: string
  /** Logical dimensions shared with normal canvas previews. */
  size: { width: number, height: number }
  /** Absolute first-party preview source URL. */
  previewBase: string
  /** Measured fixed chrome; matrix adds its own axis-control reservation once. */
  contentInsets?: CanvasContentInsets
  /** Hide matrix controls and guidance while retaining coordinate labels. */
  uiHidden?: boolean
  /** Current hidden discovery runtime failed before usable axes arrived. */
  discoveryFailed?: boolean
}>()
const emit = defineEmits<{ axes: [value: { rows: string, cols: string }], error: [error: unknown], addAxis: [] }>()
const canvas = useCanvasStore()
const matrix = useMatrixStore()
// Only explicit domain edits publish URL intent; source discovery remains passive.
watch(matrix.axisRevision, () => emit('axes', { rows: matrix.rows.value, cols: matrix.cols.value }), { flush: 'post' })
onBeforeUnmount(watchMatrixFrameSelection(matrix, canvas))
const context = useHistoireContext()
const snapshot = useHistoireSnapshot()
const { story, variant } = useSelection()
const baseVariant = computed(() => variant.value?.id ?? story.value?.variants[0]?.id)
const rowValues = computed(() => matrix.rowAxis.value ? filterMatrixValues(matrix.rowAxis.value, matrix.rowValues.value) : [])
const colValues = computed(() => matrix.colAxis.value ? filterMatrixValues(matrix.colAxis.value, matrix.colValues.value) : [])
/** Matrix projections share a variant, but never share intrinsic dimensions. */
function cellSize(cell: MatrixCellData) {
  const target = { storyId: story.value?.id ?? '', variantId: baseVariant.value ?? '' }
  return canvas.contentSizes.get(cell.key, canvasContentKey(snapshot.value, target, cell.props)) ?? props.size
}
/** Rendering and selection share fixed-pixel matrix gutter/gap calculations. */
function layoutFrames(zoom = canvas.effectiveZoom) {
  return layoutMatrixFrames(matrix.cells.value, { storyId: story.value?.id ?? '', variantId: baseVariant.value ?? '', rows: rowValues.value, cols: colValues.value, size: canvas.autoFitContent ? cellSize : props.size, zoom })
}
const frames = computed(() => layoutFrames())
const topInset = computed(() => Math.max(props.uiHidden ? MATRIX_COLUMN_HEADER : MATRIX_TOP_INSET, props.contentInsets?.topInset ?? 0))
const insets = computed(() => ({ topInset: topInset.value, bottomInset: props.contentInsets?.bottomInset ?? 0 }))
// Viewport ledger already holds the hidden canonical primary's slot.
const ledger = useCanvasFrameLedger()
const live = useCanvasFrameAdmission({
  frames: () => frames.value,
  viewport: () => {
    const content = canvasContentRect(canvas.viewport, { inspectorWidth: canvas.inspectorWidth, ...insets.value })
    const origin = clientToCanvas(content, canvas.effectiveZoom, canvas.panOffset)
    return { ...origin, width: content.width / canvas.effectiveZoom, height: content.height / canvas.effectiveZoom }
  },
  budget: () => ledger.available.value,
  selected: () => matrix.selectedCell.value?.key ?? null,
  moving: () => canvas.panning,
  context: () => JSON.stringify([story.value?.id, baseVariant.value, matrix.cells.value.map(cell => cell.key), props.size.width, props.size.height, canvas.viewport.width, canvas.viewport.height, canvas.inspectorWidth]),
})
const rowPosition = computed(() => {
  if (!frames.value.length) return []
  return rowValues.value.map((value, index) => {
    const frame = frames.value[index * colValues.value.length]
    return { value, style: { top: `${(frame.y + frame.height / 2) * canvas.effectiveZoom + canvas.panOffset.y}px`, left: `${canvas.panOffset.x}px`, width: `${MATRIX_ROW_GUTTER}px` } }
  })
})
const colPosition = computed(() => {
  if (!frames.value.length) return []
  return colValues.value.map((value, index) => {
    const frame = frames.value[index]
    return { value, style: { top: `${frame.y * canvas.effectiveZoom + canvas.panOffset.y - MATRIX_COLUMN_HEADER}px`, left: `${frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`, width: `${frame.width * canvas.effectiveZoom}px` } }
  })
})

/** Fit calculation uses same logical coordinate system and inspector reserve. */
function geometry(): void {
  canvas.setGeometry(canvas.viewport, matrixLayoutBounds(frames.value), canvas.inspectorWidth, insets.value)
}
watch([frames, () => canvas.viewport.width, () => canvas.viewport.height, () => canvas.inspectorWidth, insets], geometry, { immediate: true })
onMounted(() => {
  try {
    const window = context.root.value?.ownerDocument.defaultView
    if (window) matrix.restore(window.localStorage)
  }
  catch { /* Matrix remains usable when storage is restricted. */ }
})
</script>

<template>
  <div class="htw:absolute htw:inset-0 htw:pointer-events-none">
    <div v-if="!uiHidden && matrix.available.value" class="histoire-matrix-axis-position htw:absolute htw:inset-x-[var(--histoire-canvas-info-inset)_calc(var(--histoire-canvas-inspector-reserve)_+_var(--histoire-canvas-info-inset))] htw:top-[128px] htw:z-[15] htw:pointer-events-auto htw:@container/matrix-axis">
      <MatrixAxisBar @axes="emit('axes', $event)" />
    </div>
    <div v-if="!uiHidden && (!matrix.available.value || !matrix.cells.value.length)" class="htw:absolute htw:inset-[184px_calc(var(--histoire-canvas-inspector-reserve)_+_var(--histoire-canvas-info-inset))_24px_var(--histoire-canvas-info-inset)] htw:grid htw:place-items-center htw:overflow-auto">
      <MatrixAvailabilityState :failed="discoveryFailed" @add-axis="emit('addAxis')" />
    </div>
    <div v-else class="histoire-matrix-board htw:absolute htw:inset-0 htw:overflow-hidden" :style="{ top: `${topInset}px` }">
      <!-- Keep world coordinates unchanged while clipping beneath fixed chrome. -->
      <div class="htw:absolute htw:inset-0" :style="{ top: `${-topInset}px` }">
        <span v-for="(position, index) in rowPosition" :key="index" class="htw:absolute htw:overflow-hidden htw:text-muted htw:font-mono htw:text-[11px] htw:whitespace-nowrap htw:text-ellipsis htw:[transform:translateY(-50%)] htw:pe-3" :style="position.style">{{ matrix.rows.value }}={{ JSON.stringify(position.value) }}</span>
        <span v-for="(position, index) in colPosition" :key="index" class="htw:absolute htw:overflow-hidden htw:text-muted htw:font-mono htw:text-[11px] htw:whitespace-nowrap htw:text-ellipsis htw:text-center" :style="position.style">{{ matrix.cols.value }}={{ JSON.stringify(position.value) }}</span>
        <MatrixCell v-for="(cell, index) in matrix.cells.value" :key="cell.key" :cell="cell" :frame="frames[index]" :fit-bounds="zoom => layoutFrames(zoom)[index]" :live="live.has(cell.key)" :variant-id="baseVariant ?? ''" :preview-base="previewBase" />
      </div>
    </div>
  </div>
</template>
