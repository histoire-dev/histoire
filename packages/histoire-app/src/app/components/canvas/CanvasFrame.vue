<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasRect } from './pan/usePanZoom.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc, useLoadingDelay } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrameBackground, useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useContextMenu } from '../../composables/context-menu.js'
import { getBackgroundStyle } from '../../util/background.js'
import { useWorkbenchTestsModel } from '../panes/tests/model.js'
import { getActiveCanvasTool } from './active-tool.js'

import CanvasLoadingIndicator from './CanvasLoadingIndicator.vue'
import CanvasReplicaPreview from './CanvasReplicaPreview.vue'
import { useFrameBadges } from './frame-badges.js'
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
  /** Suspend native frame input while its resize grip owns the pointer. */
  dragging?: boolean
}>()
const emit = defineEmits<{ select: [variantId: string], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout] }>()
const canvas = useCanvasStore()
const registry = useCanvasFrames()
const menu = useContextMenu()
const tests = useWorkbenchTestsModel()
const test = computed(() => tests?.rows.value.find(row => row.target.storyId === props.frame.storyId && row.target.variantId === props.frame.variantId))
const testIcon = computed(() => test.value?.failed || test.value?.error ? 'error-filled' : test.value?.stale ? 'warning-alt-filled' : test.value?.summary ? 'checkmark-filled' : props.variant.hasTests ? 'subtract' : null)
/** Plugin badges of this frame's header. */
const badges = useFrameBadges(() => ({ key: props.frame.id, target: { storyId: props.frame.storyId, variantId: props.frame.variantId } }))
const replica = ref<{ retry: () => Promise<void> }>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadingVisible = useLoadingDelay(() => status.value === 'loading', () => props.frame.id)
const testRunningVisible = useLoadingDelay(() => !!test.value?.running, () => props.frame.id)
/** A previous rendering stands in while the cell loads. */
const snapshotShown = ref(false)
const error = ref<unknown>()
const single = computed(() => props.presentation === 'single')
/** Snapshots need the title row to tell they aren't live yet; Single has none. */
const showSnapshot = computed(() => snapshotShown.value && !single.value)
const scale = computed(() => canvas.effectiveZoom)
const position = computed(() => ({
  'left': single.value ? undefined : `${props.frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`,
  'top': single.value ? undefined : `${props.frame.y * canvas.effectiveZoom + canvas.panOffset.y}px`,
  'width': `${props.frame.width * scale.value}px`,
  '--histoire-frame-label-height': `${CANVAS_FRAME_LABEL_HEIGHT}px`,
}))
const previewStyle = computed(() => ({ width: `${props.width}px`, height: `${props.height}px`, transform: `scale(${scale.value})` }))
const background = useCanvasFrameBackground(() => props.frame.id)
/** Grid can extend the card beyond the intrinsic sandbox. */
const bodyStyle = computed(() => ({ height: `${(props.frame.bodyHeight ?? props.height) * scale.value}px`, ...getBackgroundStyle(background.value) }))
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
watch(() => props.frame.id, () => {
  // A retained Single document changes logical ownership before child selection.
  status.value = 'loading'
  error.value = undefined
  register()
}, { flush: 'sync' })
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

/** Pan tool keeps frame bodies as drag surfaces; only the label selects on plain click. */
function selectFromBody() {
  if (getActiveCanvasTool(canvas) !== 'pan') select()
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
  <!-- Unscaled frame chrome owns selection; group state never restarts its runtime. -->
  <section class="histoire-canvas-frame htw:group/frame htw:absolute htw:min-w-0 htw:pointer-events-auto htw:data-[single=true]:relative htw:data-[single=true]:overflow-hidden htw:data-[single=true]:rounded-[7px] htw:data-[dimmed=true]:data-[selected=false]:opacity-35" :class="{ 'is-selected': selected }" :data-single="single" :data-selected="selected" :data-highlighted="highlighted ?? false" :data-dimmed="dimmed ?? false" :data-stale="stale ?? false" :style="position" :data-frame-id="frame.id" @contextmenu="openMenu">
    <button v-if="!single" type="button" class="histoire-frame-label htw:box-border htw:w-full htw:min-w-0 htw:h-(--histoire-frame-label-height) htw:flex htw:items-center htw:justify-between htw:gap-2 htw:m-0 htw:pt-0 htw:px-0 htw:pb-2 htw:border-0 htw:bg-transparent htw:text-muted htw:[font-family:inherit] htw:text-[13px] htw:leading-5 htw:text-left htw:cursor-pointer htw:group-data-[selected=false]/frame:group-data-[highlighted=false]/frame:enabled:hover:text-text htw:focus-visible:outline-2 htw:focus-visible:outline-solid htw:focus-visible:outline-accent htw:focus-visible:outline-offset-2 htw:disabled:opacity-45 htw:disabled:cursor-default htw:group-data-[selected=true]/frame:text-accent htw:group-data-[selected=true]/frame:font-bold htw:group-data-[highlighted=true]/frame:text-accent" data-canvas-overlay-occluder :aria-pressed="selected" :disabled="!canSelect" @click="select" @keydown="onKeyDown">
      <span class="histoire-frame-title htw:flex-1 htw:min-w-0 htw:overflow-hidden htw:text-ellipsis htw:whitespace-nowrap" :title="variant.title">{{ variant.title }}</span><span v-for="badge in badges" :key="badge.id" class="histoire-frame-badge htw:flex-none htw:min-w-[18px] htw:h-[18px] htw:px-[5px] htw:box-border htw:inline-flex htw:items-center htw:justify-center htw:rounded-full htw:text-[11px] htw:font-semibold htw:leading-none htw:tabular-nums htw:data-[tone=neutral]:bg-chip htw:data-[tone=neutral]:text-muted htw:data-[tone=accent]:bg-accent-soft htw:data-[tone=accent]:text-accent-text htw:data-[tone=warning]:bg-warn/20 htw:data-[tone=warning]:text-warn htw:data-[tone=danger]:bg-danger-soft htw:data-[tone=danger]:text-danger-text" :data-tone="badge.tone" :title="badge.label"><span :aria-hidden="badge.label ? 'true' : undefined">{{ badge.text }}</span><span v-if="badge.label" class="htw:sr-only">{{ badge.label }}</span></span><BuiltinIcon v-if="status === 'error'" icon="error-filled" :size="16" class="htw:flex-none htw:text-danger" /><HstPulsatingDisc v-else-if="testRunningVisible || (showSnapshot && loadingVisible)" immediate :size="14" class="htw:flex-none htw:mx-px htw:text-muted" /><BuiltinIcon v-else-if="testIcon" :icon="testIcon" :size="16" class="htw:flex-none" :class="test?.failed || test?.error ? 'htw:text-danger' : 'htw:text-accent'" />
    </button>
    <div class="htw:relative htw:w-full htw:overflow-hidden htw:border htw:border-solid htw:border-border htw:rounded-[7px] htw:bg-white htw:group-data-[single=true]/frame:border-0 htw:group-data-[selected=true]/frame:border-accent htw:group-data-[highlighted=true]/frame:border-accent htw:group-data-[selected=true]/frame:after:content-[''] htw:after:hidden htw:group-data-[selected=true]/frame:after:block htw:after:absolute htw:after:inset-0 htw:after:rounded-[inherit] htw:after:pointer-events-none htw:after:z-[3] htw:after:shadow-[inset_0_0_0_1px_var(--histoire-accent)] htw:group-data-[single=true]/frame:after:shadow-[inset_0_0_0_1px_var(--histoire-border)]" data-test-id="responsive-preview-bg" :style="bodyStyle" @click="selectFromBody">
      <div class="histoire-frame-content htw:origin-top-left htw:group-data-[dimmed=true]/frame:group-data-[selected=true]/frame:opacity-35 htw:group-data-[stale=true]/frame:opacity-40 htw:group-data-[stale=true]/frame:pointer-events-none" :style="previewStyle" :aria-busy="status !== 'ready'" :inert="status !== 'ready' || stale ? true : undefined">
        <CanvasReplicaPreview v-if="live" ref="replica" :interactive="!dragging" :frame-id="frame.id" :story-id="frame.storyId" :variant-id="frame.variantId" :preview-base="previewBase" :viewport="single ? { width, height } : undefined" @status="updateStatus" @snapshot="snapshotShown = $event" />
      </div>
      <div v-if="!live" class="htw:absolute htw:inset-0 htw:flex htw:flex-col htw:items-center htw:justify-center htw:gap-3 htw:p-4 htw:text-[12px] htw:text-center htw:text-muted htw:bg-input">
        {{ variant.title }}
      </div>
      <div v-else-if="loadingVisible && !showSnapshot" class="htw:absolute htw:inset-0 htw:flex htw:flex-col htw:items-center htw:justify-center htw:gap-3 htw:p-4 htw:text-[12px] htw:text-center htw:text-muted htw:bg-input" role="status" aria-label="Loading variant">
        <CanvasLoadingIndicator />
      </div>
      <div v-else-if="status === 'error'" class="htw:absolute htw:inset-0 htw:flex htw:flex-col htw:items-center htw:justify-center htw:gap-3 htw:p-4 htw:text-[12px] htw:text-center htw:z-[2] htw:text-danger htw:bg-danger-soft" role="alert">
        <span>{{ error instanceof Error ? error.message : 'Variant unavailable' }}</span><HstButton class="htw:py-1 htw:px-2.5 htw:text-inherit" color="default" @click.stop="replica?.retry()">
          Retry
        </HstButton>
      </div>
      <!-- Ready replicas keep direct pointer input; paused cards still activate canonical selection. -->
      <div v-if="!selected && (!live || status !== 'ready') && canSelect" class="histoire-frame-select htw:absolute htw:inset-0 htw:cursor-pointer" aria-hidden="true" />
    </div>
  </section>
</template>
