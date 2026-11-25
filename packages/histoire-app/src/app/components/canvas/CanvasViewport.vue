<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSession } from '@histoire/sdk'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createCanvasFrames, provideCanvas, provideCanvasPointerPan } from '../../composables/canvas-settings.js'
import { useContextMenu } from '../../composables/context-menu.js'
import { type CanvasArrangement, isBuiltinCanvasArrangement } from '../../stores/canvas-arrangement.js'
import { createCanvasStore, getCanvasStorage } from '../../stores/canvas.js'
import { useUiSettingsStore } from '../../stores/settings.js'
import { useStoryCanvasViews } from '../../stores/story-canvas-views.js'
import { getSearchFrameState } from '../panes/search/frame-navigation.js'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import { useCanvasExtensions } from './canvas-extensions.js'
import { createCanvasHeaderEditor } from './canvas-header-editor.js'
import CanvasFrame from './CanvasFrame.vue'
import CanvasHeader from './CanvasHeader.vue'
import CanvasMatrixPrimary from './CanvasMatrixPrimary.vue'
import CanvasSingleVariant from './CanvasSingleVariant.vue'
import CanvasStatus from './CanvasStatus.vue'
import CollectErrorCard from './CollectErrorCard.vue'
import { createCanvasFrameActivation } from './frame-activation.js'
import { watchCanvasFrameFocus } from './frame-focus.js'
import { bindCanvasFrameInteractions } from './frame-interactions.js'
import { canvasFrameBounds, type CanvasFrameLayout, keepFrameLayouts, layoutCanvasFrames, visibleCanvasFrames } from './frame-layout.js'
import { watchCanvasListDefaultSelection, watchCanvasSelectedSession } from './frame-selection.js'
import { createCanvasFrameState } from './frame-state.js'
import FrameGrid from './FrameGrid.vue'
import FrameList from './FrameList.vue'
import { useViewportFrames } from './frames/viewport-frames.js'
import CanvasPluginLayers from './overlays/CanvasPluginLayers.vue'
import { type CanvasSize, clientToCanvas } from './pan/usePanZoom.js'
import { selectedSingleFrame, singleViewportSettings } from './single-viewport.js'
import { storyFrameSize } from './story-frame-size.js'
import { bindStoryCanvasView } from './story-view-binding.js'
import { useCanvasGeometry } from './useCanvasGeometry.js'
import { useCanvasHeaderOcclusion } from './useCanvasHeaderOcclusion.js'
import { useCanvasPan } from './useCanvasPan.js'
import { useCanvasVariantSize } from './useCanvasVariantSize.js'
import { useSingleVariantGeometry } from './useSingleVariantGeometry.js'
import { createCanvasViewportEvents } from './viewport-events.js'
import { canvasViewFitBounds, leasedFrameFor, useCanvasViewContext, useCanvasViewDescriptor } from './views/canvas-views.js'
import PluginCanvasView from './views/PluginCanvasView.vue'

const props = withDefaults(defineProps<{
  /** Absolute source base supplied by standalone adapter. */
  previewBase: string
  /** Approved maximum live frames, including selected frame. */
  frameBudget: number
  /** Project gutter for stories whose layout sets no padding. */
  framePadding?: number
  /** URL arrangement provided by narrow standalone navigation adapter. */
  arrange?: CanvasArrangement
  /** Arrangement resolved without an explicit URL override. */
  baseArrange?: CanvasArrangement
  /** Whether a valid URL arrangement overrides remembered story views. */
  arrangementOverride?: boolean
  /** Floating inspector width excluded from fit geometry. */
  inspectorWidth?: number
  /** Exact JSON tuple target keys emitted by search pane. */
  highlightedTargets?: readonly string[]
  /** Exact query is active on a ready source; ordinary tuple matches exclude matrix. */
  searchActive?: boolean
  /** Comment placement intercepts preview input without changing persistent tool enum. */
  commentMode?: boolean
  /** Hide workbench chrome while retaining story frames and coordinate labels. */
  uiHidden?: boolean
}>(), { arrange: 'grid', baseArrange: 'grid', arrangementOverride: false, inspectorWidth: 0, uiHidden: false })
const emit = defineEmits<{ error: [error: unknown], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout], framePointer: [target: { storyId: string, variantId: string, frameKey: string, point: { x: number, y: number }, clientPoint: { x: number, y: number } }], selectedSession: [session: HistoireSession | undefined] }>()
const session = useHistoireSession()
const snapshot = useHistoireSnapshot()
const contextMenu = useContextMenu()
const viewport = ref<HTMLElement>()
const toolbar = ref<HTMLElement>()
const header = ref<HTMLElement>()
const panHint = ref<InstanceType<typeof CanvasStatus>>()
const singleVariant = ref<InstanceType<typeof CanvasSingleVariant>>()
const cachedStory = shallowRef<HistoireCatalogStory>()
const cachedVariantId = ref<string | null>(null)
// Field computeds stay stable across unrelated publications, sparing frame layout/measure.
const catalog = computed(() => snapshot.value.catalog)
const selectedVariantId = computed(() => snapshot.value.selection?.variantId)
const currentStory = computed(() => catalog.value.stories.find(story => story.id === snapshot.value.selection?.storyId))
const diagnostics = computed(() => catalog.value.diagnostics.filter(error => error.code === 'COLLECTION_FAILED' && (error.storyId === (currentStory.value?.id ?? cachedStory.value?.id) || error.relativePath === (currentStory.value?.relativePath ?? cachedStory.value?.relativePath))))
const story = computed(() => currentStory.value ?? (diagnostics.value.length ? cachedStory.value : undefined))
const settings = useUiSettingsStore()
const renderedArrange = computed(() => props.arrange)
const views = useStoryCanvasViews()
const canvas = createCanvasStore({
  singleViewport: settings?.singleViewport,
  storage: getCanvasStorage(typeof window === 'undefined' ? undefined : window),
  frameSizeFromCode: () => renderedArrange.value !== 'single' && isBuiltinCanvasArrangement(renderedArrange.value) ? storyFrameSize(views, story.value) : undefined,
})
const registry = createCanvasFrames(canvas)
const frameState = createCanvasFrameState(session)
const activeView = useCanvasViewDescriptor(() => renderedArrange.value)
/** Failure belongs to the hidden runtime; usable axes still take precedence in Matrix. */
const matrixDiscoveryFailed = ref(false)
provideCanvas(canvas, registry, frameState)
const viewBinding = bindStoryCanvasView({
  getStoryId: () => story.value?.id,
  getArrangement: () => props.arrange,
  getRenderedArrangement: () => renderedArrange.value,
  getBaseArrangement: () => props.baseArrange,
  hasArrangementOverride: () => props.arrangementOverride,
  getSyncZoom: () => settings?.state.syncZoom ?? false,
  canvas,
  views,
})
const { size, frameContentSize, viewportContentSize } = useCanvasVariantSize(canvas)
/** Story gutter around each frame, else the project one; unusable values leave none. */
const framePadding = computed(() => {
  const value = story.value?.layout?.padding ?? props.framePadding
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
})
/** Frame chrome includes the gutter on both sides of the variant. */
function paddedFrameSize(variantId: string) {
  const content = frameContentSize(variantId)
  return { width: content.width + framePadding.value * 2, height: content.height + framePadding.value * 2 }
}
const { area: singleArea, size: singleSize, measure: measureSingle } = useSingleVariantGeometry(canvas, { settings: () => snapshot.value.settings, inspectorWidth: () => props.inspectorWidth, hidden: () => props.uiHidden, contentSize: () => canvas.autoFitContent ? viewportContentSize(selectedVariantId.value) : undefined, padding: () => framePadding.value })
/** Reuse arrangement geometry for rendering and target-zoom selection fitting; custom views lay out their own leases. */
function layoutFrames(zoom = canvas.effectiveZoom) {
  if (activeView.id.value) return []
  if (renderedArrange.value === 'single') {
    const variantId = selectedVariantId.value ?? (diagnostics.value.length ? cachedVariantId.value : null)
    return selectedSingleFrame(story.value, variantId, singleSize.value)
  }
  return story.value ? layoutCanvasFrames(story.value.id, story.value.variants.map(variant => variant.id), paddedFrameSize, renderedArrange.value === 'list' ? 'list' : 'grid', 3, zoom) : []
}
/** Resolve selection-fit geometry by stable target after visible-frame filtering. */
function fitBoundsForFrame(frame: CanvasFrameLayout, zoom: number): CanvasFrameLayout {
  return layoutFrames(zoom).find(candidate => candidate.id === frame.id) ?? frame
}

const frames = computed<CanvasFrameLayout[]>(previous => keepFrameLayouts(previous, layoutFrames()))
const canvasViewport = computed(() => {
  const origin = clientToCanvas({ x: 0, y: 0 }, canvas.effectiveZoom, canvas.panOffset)
  return { ...origin, width: Math.max(0, canvas.viewport.width - props.inspectorWidth) / canvas.effectiveZoom, height: canvas.viewport.height / canvas.effectiveZoom }
})
const variantsById = computed(() => new Map(story.value?.variants.map(variant => [variant.id, variant]) ?? []))
const selectedFrame = computed(() => frames.value.find(frame => frame.variantId === (selectedVariantId.value ?? (diagnostics.value.length ? cachedVariantId.value : null))))
const selectedVariant = computed(() => selectedFrame.value ? variantsById.value.get(selectedFrame.value.variantId) : undefined)
const singleResizable = computed(() => !props.uiHidden && !selectedVariant.value?.responsiveDisabled)
const { space, pointer, panning } = useCanvasPan({ canvas, viewport: () => viewport.value, arrangement: () => renderedArrange.value, frameId: () => selectedFrame.value?.id, single: () => singleVariant.value })
provideCanvasPointerPan(pointer)
/** Bound canvas DOM to visible frames while retaining selected inspector ownership. */
const renderedFrames = computed(() => {
  const visible = visibleCanvasFrames(frames.value, canvasViewport.value)
  const selected = selectedFrame.value
  if (!selected || visible.some(frame => frame.id === selected.id)) return visible
  return [...visible, selected].sort((first, second) => first.y - second.y || first.x - second.x)
})
const viewportEvents = createCanvasViewportEvents({
  getViewport: () => viewport.value,
  frames: registry,
  canvas,
  pointer,
  getSelectedFrame: () => selectedFrame.value,
  getCommentMode: () => !!props.commentMode,
  isPanning: () => panning.value,
  openMenu: (event, target) => contextMenu?.open(event, target),
  emitFramePointer: target => emit('framePointer', target),
})
const providerRoot = useHistoireContext().root
const { live, leases } = useViewportFrames({
  budget: () => props.frameBudget,
  arrangement: () => renderedArrange.value,
  frames: () => frames.value,
  viewport: () => canvasViewport.value,
  selected: () => selectedFrame.value?.id ?? null,
  moving: () => canvas.panning,
  context: () => JSON.stringify([story.value?.id, renderedArrange.value, size.value.width, size.value.height, canvas.viewport.width, canvas.viewport.height, props.inspectorWidth]),
  leases: { canonical: session, frames: registry, previewBase: () => props.previewBase, settings: () => snapshot.value.settings, root: () => providerRoot.value, menu: contextMenu },
})
const viewContext = useCanvasViewContext(activeView, useCanvasExtensions({ canvas, frames: registry, viewport: () => viewport.value, leases }))
let stopInteractions = () => {}
let initialFocusPending = true
const { insets: contentInsets, headerBounds, measure } = useCanvasGeometry({
  viewport: () => viewport.value,
  toolbar: () => toolbar.value,
  header: () => header.value,
  footer: () => panHint.value?.$el,
  temporaryPan: () => renderedArrange.value === 'single' ? panning.value : space.held.value || canvas.panning,
  onMeasure(size, insets) {
    if (renderedArrange.value === 'single') return measureSingle(size, insets)
    if (activeView.id.value) return canvas.setGeometry(size, canvasViewFitBounds(activeView.view.value, activeView.workbench), props.inspectorWidth, insets)
    if (renderedArrange.value === 'matrix') {
      canvas.viewport = size
      canvas.inspectorWidth = props.inspectorWidth
      return
    }
    const selected = selectedFrame.value
    // Fixed-pixel labels and gaps make extent zoom-dependent; Fit solves it without relayout feedback.
    canvas.setGeometry(size, zoom => canvasFrameBounds(layoutFrames(zoom)), props.inspectorWidth, insets, selected ? zoom => fitBoundsForFrame(selected, zoom) : undefined)
    // Selection can arrive before the host has measurable dimensions; reveal it once ready.
    if (initialFocusPending && selectedFrame.value && size.width > props.inspectorWidth && size.height > (insets.topInset ?? 0) + (insets.bottomInset ?? 0)) {
      viewBinding.focusInitialFrame(selectedFrame.value)
      initialFocusPending = false
    }
  },
})
const headerObscured = useCanvasHeaderOcclusion({ header: () => header.value, viewport: () => viewport.value, canvas, registry, bounds: () => headerBounds.value, enabled: () => renderedArrange.value !== 'matrix' })
const { canOpenInEditor, openInEditor } = createCanvasHeaderEditor({
  session,
  snapshot: () => snapshot.value,
  currentStory: () => currentStory.value,
  displayedStory: () => story.value,
  hasCollectionError: () => diagnostics.value.length > 0,
  isObscured: () => headerObscured.value,
  reportError: error => emit('error', error),
})

const stopSelectedSession = watchCanvasSelectedSession({
  snapshot: () => snapshot.value,
  registry,
  // Custom views publish the leased frame showing the selected variant.
  frameFor: target => activeView.id.value ? leasedFrameFor(registry, target) : null,
  unavailable: () => diagnostics.value.length > 0 || renderedArrange.value === 'matrix',
  publish: owner => emit('selectedSession', owner),
})

/** Frame activation changes canonical route without moving or replacing its runtime. */
function selectVariant(variantId: string): Promise<void> {
  if (!story.value) return Promise.resolve()
  return session.selection.select({ storyId: story.value.id, variantId }).catch(error => emit('error', error))
}

/** Persist one completed physical Single resize through canonical settings ownership. */
function resizeSingleViewport(size: CanvasSize): void {
  void session.settings.update(singleViewportSettings(size, snapshot.value.settings.rotate)).catch(error => emit('error', error))
}

watchCanvasListDefaultSelection({ snapshot: () => snapshot.value, arrangement: () => renderedArrange.value, zoom: () => canvas.zoom, unavailable: () => diagnostics.value.length > 0, select: selectVariant })

const activation = createCanvasFrameActivation({ registry, snapshot: () => snapshot.value, unavailable: () => renderedArrange.value === 'matrix' || diagnostics.value.length > 0, select: target => session.selection.select(target).catch(error => emit('error', error)) })

watch(currentStory, (value) => {
  if (value) cachedStory.value = value
}, { immediate: true })
watch(() => snapshot.value.selection?.variantId, (value) => {
  if (value) cachedVariantId.value = value
}, { immediate: true })
// Matrix may temporarily render as Grid while its axes are unavailable; zoom follows actual canvas content.
watch(renderedArrange, (arrangement) => {
  if (viewBinding.isActiveStory(story.value?.id)) canvas.setArrangement(arrangement)
}, { flush: 'sync', immediate: true })
// Custom view layouts follow their registered (leased) frames and `requestLayout` calls.
watch([frames, () => selectedFrame.value?.id, () => props.inspectorWidth, () => props.uiHidden, renderedArrange, story, panning, () => activeView.view.value && registry.frames.size, activeView.layoutRevision], measure, { flush: 'post' })
watchCanvasFrameFocus({
  getFrame: () => selectedFrame.value,
  getArrange: () => renderedArrange.value,
  focusFrame: canvas.focusFrame,
  selectFrame: canvas.selectFrame,
  shouldRevealFrame: frame => viewBinding.shouldRevealFrame(frame) && activation.shouldReveal(frame.id),
})
onMounted(() => {
  if (viewport.value) stopInteractions = bindCanvasFrameInteractions(viewport.value, pointer, space, viewportEvents.onWheel, activation.activate)
  measure()
})
onBeforeUnmount(() => {
  viewBinding.dispose()
  stopSelectedSession()
  stopInteractions()
  frameState.dispose()
})
// Layout covers virtualized offscreen frames that registry (mounted frames only) cannot resolve.
defineExpose({ canvas, registry, getFrameLayout: (id: string) => frames.value.find(frame => frame.id === id) })
</script>

<template>
  <div ref="viewport" class="histoire-canvas-viewport htw:group/viewport htw:[--histoire-canvas-info-inset:36px] htw:relative htw:flex-1 htw:w-full htw:h-full htw:min-w-0 htw:min-h-0 htw:overflow-hidden htw:bg-canvas htw:text-text htw:touch-none htw:data-[single=true]:touch-auto htw:data-[panning=true]:data-[dragging=false]:cursor-grab htw:data-[dragging=true]:cursor-grabbing" :data-single="renderedArrange === 'single'" :data-panning="panning" :data-dragging="canvas.panning" :style="{ '--histoire-canvas-inspector-reserve': `${inspectorWidth}px` }" role="region" aria-label="Story canvas" tabindex="-1" @wheel="viewportEvents.onWheel" @contextmenu="viewportEvents.openCanvasMenu" @keydown="viewportEvents.openCanvasMenu" @pointerdown.capture="viewportEvents.capturePointer" @pointerdown="viewportEvents.pointerDown" @pointermove="pointer.onPointerMove" @pointerup="pointer.onPointerUp" @pointercancel="pointer.onPointerCancel">
    <div v-if="!uiHidden" ref="toolbar" class="histoire-canvas-toolbar-host htw:absolute htw:top-4 htw:start-[calc((100%-var(--histoire-canvas-inspector-reserve))/2)] htw:flex htw:justify-center htw:w-[max(0px,calc(100%-var(--histoire-canvas-inspector-reserve)-16px))] htw:min-w-0 htw:@container/canvas-toolbar htw:-translate-x-1/2 htw:rtl:translate-x-1/2 htw:z-10">
      <slot name="toolbar" :canvas="canvas" :frames="registry" />
    </div>
    <div v-if="story && !uiHidden" ref="header" class="histoire-canvas-header htw:absolute htw:start-(--histoire-canvas-info-inset) htw:end-[calc(var(--histoire-canvas-inspector-reserve)+var(--histoire-canvas-info-inset))] htw:top-[88px] htw:z-[1] htw:@container/canvas-header htw:pointer-events-none htw:transition-opacity htw:duration-[160ms] htw:ease-out htw:motion-reduce:transition-none htw:data-[obscured=true]:opacity-0" :data-obscured="headerObscured">
      <slot name="header" :story="story">
        <CanvasHeader :story="story" :can-open-in-editor="canOpenInEditor" @open-in-editor="openInEditor" />
      </slot>
    </div>
    <CanvasSingleVariant v-if="renderedArrange === 'single' && story" ref="singleVariant" :area="singleArea" :frame="selectedFrame" :variant="selectedVariant" :preview-base="previewBase" :stale="diagnostics.length > 0" :resizable="singleResizable" :padding="framePadding" @resize="resizeSingleViewport" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
    <PluginCanvasView v-else-if="activeView.id.value" :key="activeView.id.value" :view="activeView.view.value" :presence="activeView.presence.value" :context="viewContext" :workbench="activeView.workbench" />
    <slot v-else-if="renderedArrange === 'matrix'" name="matrix" :canvas="canvas" :frames="registry" :size="size" :padding="framePadding" :content-insets="contentInsets" :preview-base="previewBase" :discovery-failed="matrixDiscoveryFailed" />
    <component :is="renderedArrange === 'list' ? FrameList : FrameGrid" v-else :frames="renderedFrames">
      <template #default="{ frame }">
        <CanvasFrame :frame="frame" :fit-bounds="zoom => fitBoundsForFrame(frame, zoom)" :variant="variantsById.get(frame.variantId)!" :selected="frame.id === selectedFrame?.id" :live="live.has(frame.id)" :preview-base="previewBase" :padding="framePadding" :fixed-size="!!canvas.frameSizeFromCode" :stale="diagnostics.length > 0" v-bind="{ ...frameContentSize(frame.variantId), ...getSearchFrameState(frame.id, !!searchActive, highlightedTargets) }" @select="selectVariant" @contextmenu="(event, target) => emit('contextmenu', event, target)" />
      </template>
    </component>
    <CanvasMatrixPrimary :active="renderedArrange === 'matrix'" :preview-base="previewBase" :width="size.width" :height="size.height" @status="matrixDiscoveryFailed = $event === 'error'" @error="emit('error', $event)" />
    <CanvasPluginLayers v-if="!uiHidden && !commentMode" :panning="space.held.value || canvas.panning" />
    <div v-if="commentMode" class="htw:absolute htw:inset-x-0 htw:top-[76px] htw:bottom-10 htw:cursor-crosshair" @pointerdown="viewportEvents.framePointer" />
    <slot v-if="!uiHidden" name="overlays" :canvas="canvas" :frames="registry" :selected-frame="selectedFrame" />
    <CollectErrorCard v-if="diagnostics.length && !uiHidden" :errors="diagnostics" />
    <CanvasStatus v-if="panning && !uiHidden" ref="panHint" hint="pan" />
    <!-- Measure hint floats over content; it never reserves footer space, so frames don't move. -->
    <CanvasStatus v-else-if="canvas.measure && !uiHidden" hint="measure" />
    <div v-if="!story && !uiHidden" class="htw:absolute htw:inset-0 htw:grid htw:place-items-center htw:text-muted htw:pointer-events-none">
      <WorkbenchEmptyState icon="document" title="Select a story" />
    </div>
  </div>
</template>
