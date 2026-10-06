<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSession } from '@histoire/sdk'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createCanvasFrames, provideCanvas, provideCanvasPointerPan } from '../../composables/canvas-settings.js'
import { createCanvasStore, getCanvasStorage } from '../../stores/canvas.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { useUiSettingsStore } from '../../stores/settings.js'
import { getSearchFrameState } from '../panes/search/frame-navigation.js'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import { canvasOverlayIsOccluded } from './canvas-overlay-occlusion.js'
import CanvasFrame from './CanvasFrame.vue'
import CanvasHeader from './CanvasHeader.vue'
import CanvasMatrixPrimary from './CanvasMatrixPrimary.vue'
import CanvasStatus from './CanvasStatus.vue'
import CollectErrorCard from './CollectErrorCard.vue'
import { useCanvasFrameAdmission } from './frame-admission.js'
import { createCanvasArrangement } from './frame-arrangement.js'
import { watchCanvasFrameFocus } from './frame-focus.js'
import { bindCanvasFrameInteractions } from './frame-interactions.js'
import { canvasFrameBounds, type CanvasFrameLayout, layoutCanvasFrames, visibleCanvasFrames } from './frame-layout.js'
import { watchCanvasSelectedSession } from './frame-selection.js'
import { createCanvasFrameState } from './frame-state.js'
import FrameGrid from './FrameGrid.vue'
import FrameList from './FrameList.vue'
import { clientToCanvas } from './pan/usePanZoom.js'
import { usePointerPan } from './pan/usePointerPan.js'
import { useSpacePan } from './pan/useSpacePan.js'
import { useCanvasGeometry } from './useCanvasGeometry.js'

const props = withDefaults(defineProps<{
  /** Absolute source base supplied by standalone adapter. */
  previewBase: string
  /** Approved maximum live frames, including selected frame. */
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
const emit = defineEmits<{ error: [error: unknown], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout], framePointer: [target: { storyId: string, variantId: string, frameKey: string, point: { x: number, y: number }, clientPoint: { x: number, y: number } }], selectedSession: [session: HistoireSession | undefined] }>()
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const viewport = ref<HTMLElement>()
const toolbar = ref<HTMLElement>()
const header = ref<HTMLElement>()
const panHint = ref<InstanceType<typeof CanvasStatus>>()
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
const pointer = usePointerPan({ getTool: () => canvas.tool, getSpace: () => space.held.value, getOffset: () => canvas.panOffset, setOffset: canvas.setPanOffset, onActive: value => canvas.panning = value })
provideCanvasPointerPan(pointer)
const panning = computed(() => canvas.tool === 'pan' || space.held.value || canvas.panning)
const size = computed(() => {
  const settings = snapshot.value.settings
  return { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 }
})
/** Reuse arrangement geometry for rendering and target-zoom selection fitting. */
function layoutFrames(zoom = canvas.effectiveZoom) {
  return story.value ? layoutCanvasFrames(story.value.id, story.value.variants.map(variant => variant.id), size.value, renderedArrange.value === 'list' ? 'list' : 'grid', 3, zoom) : []
}
/** Resolve selection-fit geometry by stable target after visible-frame filtering. */
function fitBoundsForFrame(frame: CanvasFrameLayout, zoom: number): CanvasFrameLayout {
  return layoutFrames(zoom).find(candidate => candidate.id === frame.id) ?? frame
}

const frames = computed(() => layoutFrames())
const canvasViewport = computed(() => {
  const origin = clientToCanvas({ x: 0, y: 0 }, canvas.effectiveZoom, canvas.panOffset)
  return { ...origin, width: Math.max(0, canvas.viewport.width - props.inspectorWidth) / canvas.effectiveZoom, height: canvas.viewport.height / canvas.effectiveZoom }
})
const selectedFrame = computed(() => frames.value.find(frame => frame.variantId === (snapshot.value.selection?.variantId ?? (diagnostics.value.length ? cachedVariantId.value : null))))
/** Bound canvas DOM to visible frames while retaining selected inspector ownership. */
const renderedFrames = computed(() => {
  const visible = visibleCanvasFrames(frames.value, canvasViewport.value)
  const selected = selectedFrame.value
  if (!selected || visible.some(frame => frame.id === selected.id)) return visible
  return [...visible, selected].sort((first, second) => first.y - second.y || first.x - second.x)
})
const variantsById = computed(() => new Map(story.value?.variants.map(variant => [variant.id, variant]) ?? []))
const live = useCanvasFrameAdmission({
  frames: () => frames.value,
  viewport: () => canvasViewport.value,
  budget: () => props.frameBudget,
  selected: () => selectedFrame.value?.id ?? null,
  moving: () => canvas.panning,
  context: () => JSON.stringify([story.value?.id, renderedArrange.value, size.value.width, size.value.height, canvas.viewport.width, canvas.viewport.height, props.inspectorWidth]),
})
let iframeActivatedFrameId: string | undefined
let stopInteractions = () => {}
let initialFocusPending = true
const { insets: contentInsets, headerBounds, measure } = useCanvasGeometry({
  viewport: () => viewport.value,
  toolbar: () => toolbar.value,
  header: () => header.value,
  footer: () => panHint.value?.$el,
  temporaryPan: () => space.held.value || canvas.panning,
  onMeasure(size, insets) {
    if (renderedArrange.value === 'matrix') {
      canvas.viewport = size
      canvas.inspectorWidth = props.inspectorWidth
      return
    }
    canvas.setGeometry(size, canvasFrameBounds(frames.value), props.inspectorWidth, insets)
    // Selection can arrive before the host has measurable dimensions; reveal it once ready.
    if (initialFocusPending && selectedFrame.value && size.width > props.inspectorWidth && size.height > (insets.topInset ?? 0) + (insets.bottomInset ?? 0)) {
      canvas.focusFrame(selectedFrame.value)
      initialFocusPending = false
    }
  },
})
const headerObscured = ref(false)

/** Give mounted preview content and variant-label controls priority over fixed header metadata. */
function updateHeaderOcclusion(): void {
  const headerRect = header.value?.getBoundingClientRect()
  const frameSurfaces = [...registry.frames.values()].flatMap((frame) => {
    const iframe = frame.iframe
    return iframe?.isConnected ? [iframe.getBoundingClientRect()] : []
  })
  const labelSurfaces = [...(viewport.value?.querySelectorAll<HTMLElement>('[data-canvas-overlay-occluder]') ?? [])]
    .filter(label => label.isConnected)
    .map(label => label.getBoundingClientRect())
  headerObscured.value = Boolean(headerRect && canvasOverlayIsOccluded(headerRect, [...frameSurfaces, ...labelSurfaces]))
}

const stopSelectedSession = watchCanvasSelectedSession({
  snapshot: () => snapshot.value,
  registry,
  unavailable: () => diagnostics.value.length > 0 || renderedArrange.value === 'matrix',
  publish: owner => emit('selectedSession', owner),
})

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

/** Frame activation changes canonical route without moving or replacing its runtime. */
function selectVariant(variantId: string): Promise<void> {
  if (!story.value) return Promise.resolve()
  return session.selection.select({ storyId: story.value.id, variantId }).catch(error => emit('error', error))
}

/** Select another ready grid/list preview while leaving its original click untouched. */
function activatePreview(iframe: HTMLIFrameElement) {
  if (renderedArrange.value === 'matrix' || snapshot.value.stale || diagnostics.value.length) return
  const entry = [...registry.frames.values()].find(frame => frame.iframe === iframe)
  const selected = snapshot.value.selection
  if (!entry || (entry.storyId === selected?.storyId && entry.variantId === selected.variantId)) return
  const state = entry.session?.getSnapshot()
  if (!state || state.stale || state.runtime.status !== 'ready' || state.selection?.storyId !== entry.storyId || state.selection.variantId !== entry.variantId) return
  const targetId = entry.id
  iframeActivatedFrameId = targetId
  void selectVariant(entry.variantId).finally(async () => {
    await nextTick()
    if (iframeActivatedFrameId === targetId) iframeActivatedFrameId = undefined
  })
}

/** Clicking canvas background gives keyboard pan scope without stealing control focus. */
function pointerDown(event: PointerEvent) {
  const target = event.target as Element | null
  if (!target?.closest('button, a[href], input, textarea, select, summary, [contenteditable], [role="button"]')) viewport.value?.focus({ preventScroll: true })
  pointer.onPointerDown(event)
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
// Matrix may temporarily render as Grid while its axes are unavailable; zoom follows actual canvas content.
watch(renderedArrange, arrangement => canvas.setArrangement(arrangement), { flush: 'sync', immediate: true })
watch([frames, () => props.inspectorWidth, renderedArrange, story, panning], measure, { flush: 'post' })
watch([
  () => [canvas.effectiveZoom, canvas.panOffset.x, canvas.panOffset.y],
  () => [headerBounds.value?.top, headerBounds.value?.bottom],
  () => [...registry.frames.values()].map(frame => frame.iframe),
], updateHeaderOcclusion, { flush: 'post', immediate: true })
watchCanvasFrameFocus({
  getFrame: () => selectedFrame.value,
  getArrange: () => renderedArrange.value,
  focusFrame: canvas.focusFrame,
  selectFrame: canvas.selectFrame,
  shouldRevealFrame: (frame) => {
    if (iframeActivatedFrameId !== frame.id) return true
    iframeActivatedFrameId = undefined
    return false
  },
})
onMounted(() => {
  if (viewport.value) stopInteractions = bindCanvasFrameInteractions(viewport.value, pointer, space, onWheel, activatePreview)
  measure()
})
onBeforeUnmount(() => {
  stopSelectedSession()
  stopInteractions()
  frameState.dispose()
})
defineExpose({ canvas, registry })
</script>

<template>
  <div ref="viewport" class="histoire-canvas-viewport" :class="{ 'is-panning': panning, 'is-dragging': canvas.panning, 'is-commenting': commentMode }" :style="{ '--histoire-canvas-inspector-reserve': `${inspectorWidth}px` }" role="region" aria-label="Story canvas" tabindex="-1" @wheel="onWheel" @pointerdown.capture="framePointer" @pointerdown="pointerDown" @pointermove="pointer.onPointerMove" @pointerup="pointer.onPointerUp" @pointercancel="pointer.onPointerCancel">
    <div ref="toolbar" class="histoire-canvas-toolbar-host">
      <slot name="toolbar" :canvas="canvas" :frames="registry" />
    </div>
    <div v-if="story" ref="header" class="histoire-canvas-header" :class="{ 'is-obscured': headerObscured }">
      <slot name="header" :story="story">
        <CanvasHeader :story="story" />
      </slot>
    </div>
    <slot v-if="renderedArrange === 'matrix'" name="matrix" :canvas="canvas" :frames="registry" :size="size" :content-insets="contentInsets" :frame-budget="frameBudget" :preview-base="previewBase" />
    <component :is="renderedArrange === 'list' ? FrameList : FrameGrid" v-else :frames="renderedFrames">
      <template #default="{ frame }">
        <CanvasFrame :frame="frame" :fit-bounds="zoom => fitBoundsForFrame(frame, zoom)" :variant="variantsById.get(frame.variantId)!" :selected="frame.id === selectedFrame?.id" :live="live.has(frame.id)" :preview-base="previewBase" :width="size.width" :height="size.height" :stale="diagnostics.length > 0" v-bind="getSearchFrameState(frame.id, !!searchActive, highlightedTargets)" @select="selectVariant" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
      </template>
    </component>
    <CanvasMatrixPrimary :active="renderedArrange === 'matrix'" :width="size.width" :height="size.height" @error="emit('error', $event)" />
    <div v-if="commentMode" class="histoire-comment-capture" @pointerdown="framePointer" />
    <slot name="overlays" :canvas="canvas" :frames="registry" :selected-frame="selectedFrame" />
    <CollectErrorCard v-if="diagnostics.length" :errors="diagnostics" />
    <CanvasStatus v-if="panning" ref="panHint" :pan="true" />
    <div v-if="!story" class="histoire-canvas-empty">
      <WorkbenchEmptyState icon="document" title="Select a story" />
    </div>
  </div>
</template>

<style scoped>
.histoire-canvas-viewport { --histoire-canvas-inspector-reserve: 0px; --histoire-canvas-info-inset: 36px; position: relative; flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--histoire-canvas); color: var(--histoire-text); touch-action: none; }
/* Toolbar breakpoints follow usable canvas space after the floating inspector reserve. */
.histoire-canvas-toolbar-host { position: absolute; top: 16px; inset-inline-start: calc((100% - var(--histoire-canvas-inspector-reserve)) / 2); display: flex; justify-content: center; width: max(0px, calc(100% - var(--histoire-canvas-inspector-reserve) - 16px)); min-width: 0; container-type: inline-size; transform: translateX(-50%); z-index: 10; }
.histoire-canvas-toolbar-host:dir(rtl) { transform: translateX(50%); }
.histoire-canvas-header { position: absolute; inset-inline: var(--histoire-canvas-info-inset) calc(var(--histoire-canvas-inspector-reserve) + var(--histoire-canvas-info-inset)); top: 88px; z-index: 1; container-type: inline-size; pointer-events: none; transition: opacity 160ms ease-out; }
.histoire-canvas-header.is-obscured { opacity: 0; }
.is-panning { cursor: grab; } .is-dragging { cursor: grabbing; }
.is-panning :deep(iframe) { pointer-events: none; }
.histoire-frame-list :deep(.histoire-canvas-frame) { pointer-events: auto; }
.histoire-comment-capture { position: absolute; inset: 76px 0 40px; cursor: crosshair; }
.histoire-canvas-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--histoire-muted); pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .histoire-canvas-header { transition: none; } }
</style>
