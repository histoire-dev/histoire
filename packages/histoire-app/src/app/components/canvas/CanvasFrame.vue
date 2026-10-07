<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasRect } from './pan/usePanZoom.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrameBackground, useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useContextMenu } from '../../composables/context-menu.js'
import { getBackgroundStyle } from '../../util/background.js'
import PulsatingDisc from '../base/PulsatingDisc.vue'
import { useWorkbenchTestsModel } from '../panes/tests/model.js'

import CanvasReplicaPreview from './CanvasReplicaPreview.vue'
import { CANVAS_FRAME_LABEL_HEIGHT, type CanvasFrameLayout } from './frame-layout.js'
import { isFrameMenuShortcut, openFrameMenu } from './frame-menu.js'

const props = defineProps<{
  /** Complete canvas target and logical bounds. */
  frame: CanvasFrameLayout
  /** Single uses a scaled native document without camera positioning or frame labels. */
  presentation?: 'frame' | 'single'
  /** Complete chrome and preview geometry at selection's candidate zoom. */
  fitBounds?: (zoom: number) => CanvasRect
  /** Collected variant display metadata. */
  variant: HistoireCatalogVariant
  /** Live-budget admission; placeholders preserve target and layout. */
  live: boolean
  /** Canonical selection changes chrome and inspector, never runtime ownership. */
  selected: boolean
  /** Absolute configured source base. */
  previewBase: string
  /** Preview logical dimensions before canvas scaling. */
  width: number
  height: number
  /** Known collection failure keeps existing preview visible but inactive. */
  stale?: boolean
  /** Exact search match highlight. */
  highlighted?: boolean
  /** Active-query nonmatches dim without disabling native frame interaction. */
  dimmed?: boolean
}>()
const emit = defineEmits<{ select: [variantId: string], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout] }>()
const canvas = useCanvasStore()
const registry = useCanvasFrames()
const menu = useContextMenu()
const tests = useWorkbenchTestsModel()
const test = computed(() => tests?.rows.value.find(row => row.target.storyId === props.frame.storyId && row.target.variantId === props.frame.variantId))
const testIcon = computed(() => test.value?.failed || test.value?.error ? 'error-filled' : test.value?.stale ? 'warning-alt-filled' : test.value?.summary ? 'checkmark-filled' : props.variant.hasTests ? 'subtract' : null)
const replica = ref<{ retry: () => Promise<void> }>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref<unknown>()
const single = computed(() => props.presentation === 'single')
const scale = computed(() => canvas.effectiveZoom)
const position = computed(() => ({
  'left': single.value ? undefined : `${props.frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`,
  'top': single.value ? undefined : `${props.frame.y * canvas.effectiveZoom + canvas.panOffset.y}px`,
  'width': `${props.width * scale.value}px`,
  '--histoire-frame-label-height': `${CANVAS_FRAME_LABEL_HEIGHT}px`,
}))
const previewStyle = computed(() => ({ width: `${props.width}px`, height: `${props.height}px`, transform: `scale(${scale.value})` }))
const background = useCanvasFrameBackground(() => props.frame.id)
const canSelect = computed(() => !props.stale)
let unregister = () => {}

/** Returns logical preview coordinates beneath frame title chrome. */
function previewRect() {
  return {
    x: props.frame.x,
    y: props.frame.y + (single.value ? 0 : CANVAS_FRAME_LABEL_HEIGHT / scale.value),
    width: props.width,
    height: props.height,
  }
}

/** Register placeholder geometry before passive document readiness. */
function register() {
  unregister()
  unregister = registry.registerFrame({ id: props.frame.id, storyId: props.frame.storyId, variantId: props.frame.variantId, fitBounds: props.fitBounds ? zoom => props.fitBounds?.(zoom) ?? props.frame : undefined, rect: previewRect() })
}
onMounted(register)
watch(() => [props.frame, props.width, props.height, canvas.effectiveZoom], () => {
  const existing = registry.getFrame(props.frame.id)
  if (existing) existing.rect = previewRect()
})
watch(() => props.stale, (stale) => {
  const frame = registry.getFrame(props.frame.id)
  if (stale && frame) {
    frame.documentId = null
    frame.session = undefined
  }
})
onBeforeUnmount(() => unregister())

/** Frame failures keep retry local; passive errors never fail canonical controls. */
function updateStatus(value: typeof status.value, detail?: unknown) {
  status.value = value
  error.value = detail
}

/** All frame states use canonical selection while their admitted runtime stays mounted. */
function select() {
  if (canSelect.value) emit('select', props.variant.id)
}

/** Native menu key opens same chrome menu as pointer context menu. */
function onKeyDown(event: KeyboardEvent) {
  if (isFrameMenuShortcut(event)) {
    openMenu(event)
  }
}

/** Captured menu target does not mutate URL variant selection. */
function openMenu(event: MouseEvent | KeyboardEvent) {
  if (props.stale) return
  openFrameMenu(menu, event, { storyId: props.frame.storyId, variantId: props.frame.variantId, frameKey: props.frame.id })
  emit('contextmenu', event, props.frame)
}
</script>

<template>
  <section class="histoire-canvas-frame" :class="{ 'is-single': single, 'is-selected': selected, 'is-stale': stale, 'is-highlighted': highlighted, 'is-dimmed': dimmed }" :style="position" :data-frame-id="frame.id" @contextmenu="openMenu">
    <button v-if="!single" type="button" class="histoire-frame-label" data-canvas-overlay-occluder :aria-pressed="selected" :disabled="!canSelect" @click="select" @keydown="onKeyDown">
      <span class="histoire-frame-title" :title="variant.title">{{ variant.title }}</span><BuiltinIcon v-if="status === 'error'" icon="error-filled" :size="12" class="is-error" /><PulsatingDisc v-else-if="test?.running" :size="12" /><BuiltinIcon v-else-if="testIcon" :icon="testIcon" :size="12" :class="{ 'is-error': test?.failed || test?.error }" />
    </button>
    <div class="histoire-frame-body" data-test-id="responsive-preview-bg" :style="{ height: `${height * scale}px`, ...getBackgroundStyle(background) }" @click="select">
      <div class="histoire-frame-content" :style="previewStyle" :aria-busy="status !== 'ready'" :inert="status !== 'ready' || stale ? true : undefined">
        <CanvasReplicaPreview v-if="live" ref="replica" :frame-id="frame.id" :story-id="frame.storyId" :variant-id="frame.variantId" :preview-base="previewBase" :viewport="single ? { width, height } : undefined" @status="updateStatus" />
      </div>
      <div v-if="!live" class="histoire-frame-placeholder">
        {{ variant.title }}
      </div>
      <div v-else-if="status === 'loading'" class="histoire-frame-placeholder">
        Loading variant…
      </div>
      <div v-else-if="status === 'error'" class="histoire-frame-error" role="alert">
        <span>{{ error instanceof Error ? error.message : 'Variant unavailable' }}</span><HstButton color="default" @click.stop="replica?.retry()">
          Retry
        </HstButton>
      </div>
      <!-- Ready replicas keep direct pointer input; paused cards still activate canonical selection. -->
      <div v-if="!selected && (!live || status !== 'ready') && canSelect" class="histoire-frame-select" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.histoire-canvas-frame { position: absolute; min-width: 0; }
.histoire-canvas-frame.is-single { position: relative; overflow: hidden; border-radius: 7px; }
.is-single .histoire-frame-body { border: 0; }
.is-single .histoire-frame-body::after { display: none; }
.is-dimmed:not(.is-selected) { opacity: .35; }
.is-dimmed.is-selected .histoire-frame-content { opacity: .35; }
/* Frame labels keep selection semantics without shared button pressed surfaces. */
.histoire-frame-label {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: var(--histoire-frame-label-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 0 0 8px;
  border: 0;
  background: transparent;
  color: var(--histoire-muted);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.histoire-frame-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.histoire-canvas-frame:not(.is-selected):not(.is-highlighted) .histoire-frame-label:enabled:hover { color: var(--histoire-text); }
.histoire-frame-label:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
.histoire-frame-label:disabled { opacity: .45; cursor: default; }
.is-selected .histoire-frame-label { color: var(--histoire-accent); font-weight: 700; }
.histoire-frame-label :is(svg, .histoire-pulsating-disc) { color: var(--histoire-accent); } .histoire-frame-label svg.is-error { color: var(--histoire-danger); }
.histoire-frame-body { position: relative; width: 100%; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: 7px; background: white; }
/* Unscaled chrome owns selection so every runtime state keeps a two-pixel ring. */
.is-selected .histoire-frame-body { border-color: var(--histoire-accent); }
.is-selected .histoire-frame-body::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--histoire-accent); pointer-events: none; z-index: 3; }
.is-highlighted .histoire-frame-label { color: var(--histoire-accent); } .is-highlighted .histoire-frame-body { border-color: var(--histoire-accent); }
.histoire-frame-content { transform-origin: top left; }
.histoire-frame-select { position: absolute; inset: 0; cursor: pointer; }
.histoire-frame-placeholder, .histoire-frame-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; color: var(--histoire-muted); background: var(--histoire-field); font-size: 12px; text-align: center; }
.histoire-frame-error { z-index: 2; color: var(--histoire-danger); background: var(--histoire-danger-soft); }
.histoire-frame-error button { padding: 4px 10px; color: inherit; }
.is-stale .histoire-frame-content { opacity: .4; pointer-events: none; }
</style>
