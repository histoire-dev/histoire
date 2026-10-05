<script setup lang="ts">
import type { MatrixCellData } from '../../../util/matrix.js'
import type { CanvasFrameLayout } from '../frame-layout.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useContextMenu } from '../../../composables/context-menu.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import CanvasReplicaPreview from '../CanvasReplicaPreview.vue'
import { isFrameMenuShortcut, openFrameMenu } from '../frame-menu.js'
import { watchMatrixFrameRegistration } from './matrix-registration.js'

const props = defineProps<{
  /** Local Cartesian data and merged override set. */
  cell: MatrixCellData
  /** Logical preview bounds, excluding labels. */
  frame: CanvasFrameLayout
  /** Whether budget admits a passive preview document. */
  live: boolean
  /** Exact base variant used by every cell. */
  variantId: string
  /** Absolute first-party source URL. */
  previewBase: string
}>()
const canvas = useCanvasStore()
const registry = useCanvasFrames()
const matrix = useMatrixStore()
const menu = useContextMenu()
const preview = ref<{ getSource: () => Promise<string>, retry: () => Promise<void> }>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref<unknown>()
const position = computed(() => ({ left: `${props.frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`, top: `${props.frame.y * canvas.effectiveZoom + canvas.panOffset.y}px`, width: `${props.frame.width * canvas.effectiveZoom}px`, height: `${props.frame.height * canvas.effectiveZoom}px` }))
const style = computed(() => ({ width: `${props.frame.width}px`, height: `${props.frame.height}px`, transform: `scale(${canvas.effectiveZoom})` }))
let releaseSource = () => {}
const unregister = watchMatrixFrameRegistration({ registry, getFrame: () => props.frame, getVariantId: () => props.variantId, getPropsOverride: () => props.cell.props, onTargetChange: () => {
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
  event.preventDefault()
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
  <section class="histoire-matrix-cell" :style="position" :data-frame-id="frame.id" :data-selected="matrix.selectedCell.value?.key === cell.key" @contextmenu.prevent="openMenu">
    <div class="histoire-matrix-cell-content" :style="style">
      <CanvasReplicaPreview v-if="live" :key="variantId" ref="preview" :frame-id="frame.id" :story-id="frame.storyId" :variant-id="variantId" :preview-base="previewBase" :props-override="cell.props" @status="updateStatus" />
    </div>
    <HstButton color="flat" class="histoire-matrix-cell-select" type="button" :aria-label="`Select matrix cell ${cell.row} · ${cell.col}`" :aria-pressed="matrix.selectedCell.value?.key === cell.key" @click="matrix.selectCell(cell.key)" @keydown="onKeyDown" />
    <span v-if="!live" class="histoire-matrix-cell-placeholder">Preview paused</span>
    <div v-else-if="status === 'error'" class="histoire-matrix-cell-error" role="alert">
      <span>{{ error instanceof Error ? error.message : 'Preview unavailable' }}</span>
      <HstButton color="flat" type="button" @click="preview?.retry()">
        Retry
      </HstButton>
    </div>
  </section>
</template>

<style scoped>
.histoire-matrix-cell { position: absolute; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: 7px; background: white; }
.histoire-matrix-cell[data-selected="true"] { outline: 2px solid var(--histoire-accent); outline-offset: -1px; }
.histoire-matrix-cell-content { transform-origin: top left; }
.histoire-matrix-cell-select { position: absolute; inset: 0; width: 100%; padding: 0; }
.histoire-matrix-cell-select:focus-visible { outline-offset: -3px; }
.histoire-matrix-cell-placeholder, .histoire-matrix-cell-error { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; padding: 12px; color: var(--histoire-muted); background: var(--histoire-input); font-size: 11px; text-align: center; pointer-events: none; }
.histoire-matrix-cell-error { color: var(--histoire-danger); background: var(--histoire-danger-soft); }
.histoire-matrix-cell-error button { padding: 3px 8px; color: inherit; pointer-events: auto; }
</style>
