<script setup lang="ts">
import type { HistoireCatalogStory } from '@histoire/sdk'
import type { CanvasFrameLayout } from './frame-layout.js'
import { HstButton } from '@histoire/controls/vue'
import { PREVIEW_SETTINGS_SYNC } from '@histoire/shared'
import { HistoirePreview, useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createCanvasFrames, provideCanvas, provideCanvasPointerPan } from '../../composables/canvas-settings.js'
import { createCanvasStore, getCanvasStorage } from '../../stores/canvas.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { useUiSettingsStore } from '../../stores/settings.js'
import { getSearchFrameState } from '../panes/search/frame-navigation.js'
import CanvasFrame from './CanvasFrame.vue'
import CanvasHeader from './CanvasHeader.vue'
import CanvasStatus from './CanvasStatus.vue'
import CollectErrorCard from './CollectErrorCard.vue'
import { createCanvasArrangement } from './frame-arrangement.js'
import { watchCanvasFrameFocus } from './frame-focus.js'
import { bindCanvasFrameInteractions } from './frame-interactions.js'
import { canvasFrameBounds, layoutCanvasFrames, liveCanvasFrames } from './frame-layout.js'
import { createCanvasFrameState } from './frame-state.js'
import FrameGrid from './FrameGrid.vue'
import FrameList from './FrameList.vue'
import { clientToCanvas } from './pan/usePanZoom.js'
import { usePointerPan } from './pan/usePointerPan.js'
import { useSpacePan } from './pan/useSpacePan.js'

const props = withDefaults(defineProps<{
  /** Absolute source base supplied by standalone adapter. */
  previewBase: string
  /** Approved maximum live frames, including canonical primary. */
  frameBudget: number
  /** URL arrangement provided by narrow standalone navigation adapter. */
  arrange?: 'grid' | 'list' | 'matrix'
  /** Floating inspector width excluded from fit geometry. */
  inspectorWidth?: number
  /** Exact JSON tuple target keys emitted by search pane. */
  highlightedTargets?: readonly string[]
  /** Exact query is active on a ready source; ordinary tuple matches exclude matrix. */
  searchActive?: boolean
  /** Comment placement intercepts preview input without changing persistent tool enum. */
  commentMode?: boolean
}>(), { arrange: 'grid', inspectorWidth: 0 })
const emit = defineEmits<{ error: [error: unknown], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout], framePointer: [target: { storyId: string, variantId: string, frameKey: string, point: { x: number, y: number }, clientPoint: { x: number, y: number } }] }>()
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const viewport = ref<HTMLElement>()
const primaryContainer = ref<HTMLElement>()
const primary = ref<{ unmount: () => Promise<void> }>()
const primaryKey = ref(0)
const primaryError = shallowRef<unknown>()
const cachedStory = shallowRef<HistoireCatalogStory>()
const cachedVariantId = ref<string | null>(null)
const currentStory = computed(() => snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId))
const diagnostics = computed(() => snapshot.value.catalog.diagnostics.filter(error => error.code === 'COLLECTION_FAILED' && (error.storyId === (currentStory.value?.id ?? cachedStory.value?.id) || error.relativePath === (currentStory.value?.relativePath ?? cachedStory.value?.relativePath))))
const story = computed(() => currentStory.value ?? (diagnostics.value.length ? cachedStory.value : undefined))
const canvas = createCanvasStore({ storage: getCanvasStorage(typeof window === 'undefined' ? undefined : window) })
const registry = createCanvasFrames(canvas)
const frameState = createCanvasFrameState(session)
const settings = useUiSettingsStore()
const renderedArrange = createCanvasArrangement(() => props.arrange, useMatrixStore())
provideCanvas(canvas, registry, frameState)
const space = useSpacePan({ getTool: () => canvas.tool, getRoot: () => viewport.value })
const pointer = usePointerPan({ getTool: () => canvas.tool, getSpace: () => space.held.value, getOffset: () => canvas.panOffset, setOffset: (value) => {
  canvas.panOffset = value
  canvas.zoom = canvas.effectiveZoom
}, onActive: value => canvas.panning = value })
provideCanvasPointerPan(pointer)
const panning = computed(() => canvas.tool === 'pan' || space.held.value || canvas.panning)
const size = computed(() => {
  const settings = snapshot.value.settings
  return { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 }
})
const frames = computed(() => story.value ? layoutCanvasFrames(story.value.id, story.value.variants.map(variant => variant.id), size.value, renderedArrange.value === 'list' ? 'list' : 'grid', 3, canvas.effectiveZoom) : [])
const selectedFrame = computed(() => frames.value.find(frame => frame.variantId === (snapshot.value.selection?.variantId ?? (diagnostics.value.length ? cachedVariantId.value : null))))
const primarySearch = computed(() => getSearchFrameState(selectedFrame.value?.id, Boolean(props.searchActive && renderedArrange.value !== 'matrix'), props.highlightedTargets))
const live = computed(() => {
  const origin = clientToCanvas({ x: 0, y: 0 }, canvas.effectiveZoom, canvas.panOffset)
  return liveCanvasFrames(frames.value, { ...origin, width: Math.max(0, canvas.viewport.width - props.inspectorWidth) / canvas.effectiveZoom, height: canvas.viewport.height / canvas.effectiveZoom }, props.frameBudget, selectedFrame.value?.id ?? null)
})
const primaryStyle = computed(() => {
  const frame = selectedFrame.value
  return { left: `${(frame?.x ?? 0) * canvas.effectiveZoom + canvas.panOffset.x + (renderedArrange.value === 'list' ? 145 : 1)}px`, top: `${(frame?.y ?? 0) * canvas.effectiveZoom + canvas.panOffset.y + (renderedArrange.value === 'list' ? 1 : 29)}px`, width: `${size.value.width}px`, height: `${size.value.height}px`, transform: `scale(${canvas.effectiveZoom})`, visibility: frame && renderedArrange.value !== 'matrix' ? 'visible' as const : 'hidden' as const }
})
let resize: ResizeObserver | undefined
let mutation: MutationObserver | undefined
let primaryRegistration = ''
let stopInteractions = () => {}

/** Host measurements stay local and exclude floating inspector from automatic fit. */
function measure() {
  if (!viewport.value) return
  const rect = viewport.value.getBoundingClientRect()
  const bounds = canvasFrameBounds(frames.value)
  if (renderedArrange.value === 'matrix') {
    canvas.viewport = { width: rect.width, height: rect.height }
    canvas.inspectorWidth = props.inspectorWidth
    return
  }
  canvas.setGeometry({ width: rect.width, height: rect.height }, { ...bounds, y: bounds.y - 72, height: bounds.height + 72 }, props.inspectorWidth)
}

/** Register selected physical document; src identity changes on runtime navigation. */
function registerPrimary() {
  const frame = selectedFrame.value
  const iframe = primaryContainer.value?.querySelector('iframe')
  if (primaryRegistration && primaryRegistration !== frame?.id) {
    const previous = registry.getFrame(primaryRegistration)
    if (previous?.iframe === iframe) {
      previous.iframe = null
      previous.documentId = null
      previous.session = undefined
    }
  }
  primaryRegistration = frame?.id ?? ''
  const entry = frame && registry.getFrame(frame.id)
  if (!entry || !iframe) return
  iframe.setAttribute('data-test-id', 'preview-iframe')
  entry.iframe = iframe
  entry.documentId = snapshot.value.runtime.status === 'ready' ? new URL(iframe.src).searchParams.get('documentId') : null
  entry.session = diagnostics.value.length ? undefined : session
  const override = canvas.frameBackgrounds[frame.id]
  if (override && snapshot.value.runtime.status === 'ready') registry.postToFrame(frame.id, { type: PREVIEW_SETTINGS_SYNC, settings: { ...snapshot.value.settings, ...override } })
}

/** Wheel pans normally; modifier zoom remains anchored at local cursor position. */
function onWheel(event: WheelEvent) {
  if (!viewport.value) return
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) {
    const rect = viewport.value.getBoundingClientRect()
    canvas.setZoom(canvas.effectiveZoom * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  else {
    canvas.panBy({ x: -event.deltaX, y: -event.deltaY })
  }
}

/** Variant activation preserves route contract through canonical standalone selection facade. */
function selectVariant(variantId: string) {
  if (story.value) void session.selection.select({ storyId: story.value.id, variantId }).catch(error => emit('error', error))
}

/** Clicking canvas background gives keyboard pan scope without stealing control focus. */
function pointerDown(event: PointerEvent) {
  const target = event.target as Element | null
  if (!target?.closest('button, a[href], input, textarea, select, summary, [contenteditable], [role="button"]')) viewport.value?.focus({ preventScroll: true })
  pointer.onPointerDown(event)
}

/** Retry releases actual canonical ownership before replacement mount. */
async function retryPrimary() {
  try {
    await primary.value?.unmount()
    primaryError.value = undefined
    primaryKey.value++
  }
  catch (error) { emit('error', error) }
}

/** Comment placement captures exact registered document coordinates. */
function framePointer(event: PointerEvent) {
  if (!props.commentMode || event.button !== 0 || panning.value || (event.target as Element)?.closest('.histoire-canvas-toolbar, button, input, textarea, select, [contenteditable]')) return
  const clientPoint = { x: event.clientX, y: event.clientY }
  for (const frame of registry.frames.values()) {
    const point = registry.clientToFrame(frame.id, clientPoint)
    if (!point || point.x < 0 || point.y < 0 || point.x > frame.rect.width || point.y > frame.rect.height) continue
    event.preventDefault()
    event.stopPropagation()
    emit('framePointer', { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id, point, clientPoint })
    return
  }
}

watch(currentStory, (value) => {
  if (value) cachedStory.value = value
}, { immediate: true })
watch(() => currentStory.value?.id, (value, previous) => {
  if (value && previous && !settings?.state.syncZoom) canvas.fit()
})
watch(() => snapshot.value.selection?.variantId, (value) => {
  if (value) cachedVariantId.value = value
}, { immediate: true })
watch([frames, () => props.inspectorWidth, renderedArrange], measure, { flush: 'post' })
watchCanvasFrameFocus({ getFrame: () => selectedFrame.value, getArrange: () => renderedArrange.value, focusFrame: canvas.focusFrame, registerPrimary })
watch(() => [snapshot.value.runtime.status, snapshot.value.runtime.runtimeId, canvas.frameBackgrounds[selectedFrame.value?.id ?? '']], registerPrimary, { deep: true, flush: 'post' })
watch(() => registry.frames.get(selectedFrame.value?.id ?? ''), registerPrimary, { flush: 'post' })
onMounted(() => {
  resize = new ResizeObserver(measure)
  if (viewport.value) resize.observe(viewport.value)
  if (viewport.value) stopInteractions = bindCanvasFrameInteractions(viewport.value, pointer, space, onWheel)
  mutation = new MutationObserver(registerPrimary)
  if (primaryContainer.value) mutation.observe(primaryContainer.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  measure()
  if (selectedFrame.value && renderedArrange.value !== 'matrix') canvas.focusFrame(selectedFrame.value)
})
onBeforeUnmount(() => {
  resize?.disconnect()
  mutation?.disconnect()
  stopInteractions()
  frameState.dispose()
})
defineExpose({ canvas, registry })
</script>

<template>
  <div ref="viewport" class="histoire-canvas-viewport" :class="{ 'is-panning': panning, 'is-dragging': canvas.panning, 'is-commenting': commentMode }" :style="{ '--histoire-canvas-inspector-reserve': `${inspectorWidth}px` }" role="region" aria-label="Story canvas" tabindex="-1" @wheel="onWheel" @pointerdown.capture="framePointer" @pointerdown="pointerDown" @pointermove="pointer.onPointerMove" @pointerup="pointer.onPointerUp" @pointercancel="pointer.onPointerCancel">
    <div class="histoire-canvas-toolbar-host">
      <slot name="toolbar" :canvas="canvas" :frames="registry" />
    </div>
    <div v-if="story" class="histoire-canvas-header">
      <slot name="header" :story="story">
        <CanvasHeader :story="story" />
      </slot>
    </div>
    <slot v-if="renderedArrange === 'matrix'" name="matrix" :canvas="canvas" :frames="registry" :size="size" :frame-budget="frameBudget" :preview-base="previewBase" />
    <component :is="renderedArrange === 'list' ? FrameList : FrameGrid" v-else :frames="frames">
      <template #default="{ frame, index }">
        <CanvasFrame :frame="frame" :variant="story!.variants[index]" :selected="frame.id === selectedFrame?.id" :live="live.has(frame.id)" :preview-base="previewBase" :width="size.width" :height="size.height" :stale="diagnostics.length > 0" :arrange="renderedArrange === 'list' ? 'list' : 'grid'" v-bind="getSearchFrameState(frame.id, !!searchActive, highlightedTargets)" @select="selectVariant" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
      </template>
    </component>
    <div ref="primaryContainer" class="histoire-canvas-primary" :class="{ 'is-stale': diagnostics.length, 'is-dimmed': primarySearch.dimmed }" :style="primaryStyle">
      <HistoirePreview :key="primaryKey" ref="primary" @ready="registerPrimary" @error="primaryError = $event; emit('error', $event)">
        <template #loading>
          <div class="histoire-primary-loading">
            Loading preview…
          </div>
        </template>
        <template #error="{ error }">
          <div class="histoire-primary-error" role="alert">
            <span>{{ error instanceof Error ? error.message : 'Preview unavailable' }}</span><HstButton color="flat" @click="retryPrimary">
              Retry
            </HstButton>
          </div>
        </template>
      </HistoirePreview>
    </div>
    <div v-if="commentMode" class="histoire-comment-capture" @pointerdown="framePointer" />
    <slot name="overlays" :canvas="canvas" :frames="registry" :selected-frame="selectedFrame" />
    <CollectErrorCard v-if="diagnostics.length" :errors="diagnostics" />
    <CanvasStatus :pan="panning" />
    <div v-if="!story" class="histoire-canvas-empty">
      Select story
    </div>
  </div>
</template>

<style scoped>
.histoire-canvas-viewport { --histoire-canvas-inspector-reserve: 0px; --histoire-canvas-info-inset: 36px; position: relative; flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--histoire-canvas); color: var(--histoire-text); touch-action: none; }
/* Toolbar breakpoints follow usable canvas space after the floating inspector reserve. */
.histoire-canvas-toolbar-host { position: absolute; top: 16px; inset-inline-start: calc((100% - var(--histoire-canvas-inspector-reserve)) / 2); display: flex; justify-content: center; width: max(0px, calc(100% - var(--histoire-canvas-inspector-reserve) - 16px)); min-width: 0; container-type: inline-size; transform: translateX(-50%); z-index: 10; }
.histoire-canvas-toolbar-host:dir(rtl) { transform: translateX(50%); }
.histoire-canvas-header { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); top: 88px; z-index: 1; container-type: inline-size; pointer-events: none; }
.histoire-canvas-primary { position: absolute; transform-origin: top left; overflow: hidden; border-radius: 6px; }
.histoire-canvas-primary.is-dimmed { opacity: .35; }
.histoire-canvas-primary :deep(.histoire-primary), .histoire-canvas-primary :deep(.histoire-primary-frame) { width: 100%; height: 100%; min-height: 0; }
.is-panning { cursor: grab; } .is-dragging { cursor: grabbing; }
.is-panning .histoire-canvas-primary, .is-panning :deep(iframe) { pointer-events: none; }
.histoire-frame-list :deep(.histoire-canvas-frame) { pointer-events: auto; }
.histoire-comment-capture { position: absolute; inset: 76px 0 40px; cursor: crosshair; }
.is-stale { opacity: .4; pointer-events: none; }
.histoire-primary-loading, .histoire-primary-error { position: absolute; inset: 0; display: grid; place-items: center; color: var(--histoire-muted); font-size: 16px; }
.histoire-primary-error { gap: 16px; padding: 24px; color: var(--histoire-danger); background: var(--histoire-danger-soft); }
.histoire-primary-error button { padding: 8px 16px; color: inherit; }
.histoire-canvas-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--histoire-muted); pointer-events: none; }
</style>
