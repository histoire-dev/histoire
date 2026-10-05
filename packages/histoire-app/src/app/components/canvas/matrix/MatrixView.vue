<script setup lang="ts">
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useCanvasStore } from '../../../composables/canvas-settings.js'
import { useSelection } from '../../../composables/selection.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { filterMatrixValues } from '../../../util/matrix.js'
import { liveCanvasFrames } from '../frame-layout.js'
import { clientToCanvas } from '../pan/usePanZoom.js'
import { layoutMatrixFrames, MATRIX_COLUMN_HEADER, MATRIX_ROW_GUTTER, MATRIX_TOP_INSET, matrixLayoutBounds } from './matrix-layout.js'
import { watchMatrixFrameSelection } from './matrix-selection.js'
import MatrixAxisBar from './MatrixAxisBar.vue'
import MatrixCell from './MatrixCell.vue'

const props = defineProps<{
  /** URL row axis, validated against available finite props. */
  rows?: string
  /** URL column axis, validated independently of row. */
  cols?: string
  /** Logical dimensions shared with normal canvas previews. */
  size: { width: number, height: number }
  /** Budget includes canonical hidden preview plus admitted cells. */
  frameBudget: number
  /** Absolute first-party preview source URL. */
  previewBase: string
}>()
const emit = defineEmits<{ axes: [value: { rows: string, cols: string }], error: [error: unknown] }>()
const canvas = useCanvasStore()
const matrix = useMatrixStore()
onBeforeUnmount(watchMatrixFrameSelection(matrix, canvas))
const context = useHistoireContext()
const { story, variant } = useSelection()
const baseVariant = computed(() => variant.value?.id ?? story.value?.variants[0]?.id)
const rowValues = computed(() => matrix.rowAxis.value ? filterMatrixValues(matrix.rowAxis.value, matrix.rowValues.value) : [])
const colValues = computed(() => matrix.colAxis.value ? filterMatrixValues(matrix.colAxis.value, matrix.colValues.value) : [])
const frames = computed(() => layoutMatrixFrames(matrix.cells.value, { storyId: story.value?.id ?? '', variantId: baseVariant.value ?? '', rows: rowValues.value, cols: colValues.value, size: props.size, zoom: canvas.effectiveZoom }))
const live = computed(() => {
  if (props.frameBudget <= 1) return new Set<string>()
  const origin = clientToCanvas({ x: 0, y: MATRIX_TOP_INSET }, canvas.effectiveZoom, canvas.panOffset)
  return liveCanvasFrames(frames.value, { ...origin, width: Math.max(0, canvas.viewport.width - canvas.inspectorWidth) / canvas.effectiveZoom, height: Math.max(0, canvas.viewport.height - MATRIX_TOP_INSET) / canvas.effectiveZoom }, props.frameBudget - 1, matrix.selectedCell.value?.key ?? null)
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
  canvas.setGeometry(canvas.viewport, matrixLayoutBounds(frames.value), canvas.inspectorWidth, { topInset: MATRIX_TOP_INSET })
}
watch([frames, () => canvas.viewport.width, () => canvas.viewport.height, () => canvas.inspectorWidth], geometry, { immediate: true })
onMounted(() => {
  try {
    const window = context.root.value?.ownerDocument.defaultView
    if (window) matrix.restore(window.localStorage)
  }
  catch { /* Matrix remains usable when storage is restricted. */ }
})
</script>

<template>
  <div class="histoire-matrix-view">
    <div class="histoire-matrix-axis-position">
      <MatrixAxisBar @axes="emit('axes', $event)" />
    </div>
    <p v-if="!matrix.available.value" class="histoire-matrix-empty">
      Waiting for two finite prop axes. Boolean props and matrix hints supply values.
    </p>
    <p v-else-if="!matrix.cells.value.length" class="histoire-matrix-empty">
      No values selected. Enable row and column values in Props.
    </p>
    <div v-else class="histoire-matrix-board" :style="{ top: `${MATRIX_TOP_INSET}px` }">
      <!-- Keep world coordinates unchanged while clipping beneath fixed chrome. -->
      <div class="histoire-matrix-board-world" :style="{ top: `${-MATRIX_TOP_INSET}px` }">
        <span v-for="(position, index) in rowPosition" :key="index" class="histoire-matrix-row-label" :style="position.style">{{ matrix.rows.value }}={{ JSON.stringify(position.value) }}</span>
        <span v-for="(position, index) in colPosition" :key="index" class="histoire-matrix-col-label" :style="position.style">{{ matrix.cols.value }}={{ JSON.stringify(position.value) }}</span>
        <MatrixCell v-for="(cell, index) in matrix.cells.value" :key="cell.key" :cell="cell" :frame="frames[index]" :live="live.has(cell.key)" :variant-id="baseVariant ?? ''" :preview-base="previewBase" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.histoire-matrix-view { position: absolute; inset: 0; pointer-events: none; }
.histoire-matrix-view :deep(.histoire-matrix-cell), .histoire-matrix-axis-position { pointer-events: auto; }
.histoire-matrix-axis-position { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); top: 128px; z-index: 15; container-type: inline-size; }
.histoire-matrix-board { position: absolute; inset: 0; overflow: hidden; }
.histoire-matrix-board-world { position: absolute; inset: 0; }
.histoire-matrix-row-label, .histoire-matrix-col-label { position: absolute; overflow: hidden; color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
.histoire-matrix-row-label { transform: translateY(-50%); padding-inline-end: 12px; }
.histoire-matrix-col-label { text-align: center; }
.histoire-matrix-empty { position: absolute; top: 184px; inset-inline-start: var(--histoire-canvas-info-inset); inline-size: min(40ch, calc(100% - var(--histoire-canvas-inspector-reserve) - 72px)); margin: 0; color: var(--histoire-muted); }
</style>
