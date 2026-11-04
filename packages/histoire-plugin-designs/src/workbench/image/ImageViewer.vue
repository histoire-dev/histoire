<script setup lang="ts">
import type { ResolvedImageDesign } from '../../types.js'
import type { ImageView, Size } from './pan-zoom.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { WorkbenchErrorState, WorkbenchLoadingState } from '@histoire/plugin-kit/vue'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { centeredView, fitView, keyCommand, ZOOM_STEP, zoomAt } from './pan-zoom.js'

const props = defineProps<{
  /** Image design to show. */
  design: ResolvedImageDesign
}>()

/** Element the image is placed in; receives pointer, wheel and keyboard input. */
const viewport = ref<HTMLElement>()
/** Current zoom and position of the image. */
const view = shallowRef<ImageView>({ scale: 1, x: 0, y: 0 })
/** Natural size of the decoded image; `undefined` until it loads. */
const natural = shallowRef<Size>()
/** Image loading state. */
const status = ref<'loading' | 'ready' | 'error'>('loading')
/**
 * Set while the image is fitted, holding the offset applied on top of the fit, so the
 * viewer refits on resize; cleared once the user zooms or pans away.
 */
let fitted: { offset?: readonly [number, number] } | undefined

watch(() => props.design.src, () => {
  status.value = 'loading'
  natural.value = undefined
})

// The tab is reused across variants: a new src reloads the image (and resets on load), while a
// different scale or offset for the same src must re-apply the declared placement right away.
// Separate sources are compared value by value, so an equal design from another variant or a
// catalog refresh keeps the user's zoom.
watch([() => props.design.scale, () => props.design.offset?.[0], () => props.design.offset?.[1]], () => {
  if (status.value === 'ready') reset()
})

/** Current viewer size. */
function viewportSize(): Size {
  return { width: viewport.value?.clientWidth ?? 0, height: viewport.value?.clientHeight ?? 0 }
}

/**
 * Shows the whole image, optionally shifted.
 * @param offset Shift from the fitted position.
 */
function fit(offset?: readonly [number, number]): void {
  if (!natural.value) return
  view.value = fitView(viewportSize(), natural.value, offset)
  fitted = { offset }
}

/**
 * Centers the image at a zoom factor, optionally shifted.
 * @param scale Zoom factor.
 * @param offset Shift from the centered position.
 */
function center(scale: number, offset?: readonly [number, number]): void {
  if (!natural.value) return
  view.value = centeredView(viewportSize(), natural.value, scale, offset)
  fitted = undefined
}

/** Initial placement: declared scale, otherwise fit, then shifted by the declared offset. */
function reset(): void {
  if (props.design.scale) center(props.design.scale, props.design.offset)
  else fit(props.design.offset)
}

/**
 * Stores the natural size once the image decoded.
 * @param event Image load event.
 */
function onLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  status.value = 'ready'
  reset()
}

/**
 * Zooms around the viewer center (toolbar buttons and keyboard).
 * @param factor Zoom multiplier.
 */
function zoomCenter(factor: number): void {
  const size = viewportSize()
  view.value = zoomAt(view.value, factor, { x: size.width / 2, y: size.height / 2 })
  fitted = undefined
}

/**
 * Moves the image.
 * @param dx Horizontal shift in pixels.
 * @param dy Vertical shift in pixels.
 */
function panBy(dx: number, dy: number): void {
  view.value = { ...view.value, x: view.value.x + dx, y: view.value.y + dy }
  fitted = undefined
}

/**
 * Wheel zoom around the cursor; trackpad pinch arrives as a ctrl wheel with small deltas.
 * @param event Wheel event.
 */
function onWheel(event: WheelEvent): void {
  const box = viewport.value!.getBoundingClientRect()
  view.value = zoomAt(view.value, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), { x: event.clientX - box.left, y: event.clientY - box.top })
  fitted = undefined
}

/**
 * Keyboard pan and zoom: arrows pan, `+`/`-` zoom, `0` fits.
 * @param event Key event.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (status.value !== 'ready') return
  const command = keyCommand(event)
  if (!command) return
  event.preventDefault()
  if (command === 'fit') fit()
  else if ('zoom' in command) zoomCenter(command.zoom)
  else panBy(...command.pan)
}

/** Active pointer drag: pointer id and its last position. */
let drag: { pointerId: number, x: number, y: number } | undefined
/** A drag is in progress; switches the cursor. */
const panning = ref(false)

/**
 * Starts panning with the primary button.
 * @param event Pointer event.
 */
function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  panning.value = true
  viewport.value!.setPointerCapture(event.pointerId)
}

/**
 * Moves the image with the pointer while panning.
 * @param event Pointer event.
 */
function onPointerMove(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId) return
  panBy(event.clientX - drag.x, event.clientY - drag.y)
  drag = { ...drag, x: event.clientX, y: event.clientY }
}

/** Ends panning. */
function onPointerUp(): void {
  drag = undefined
  panning.value = false
}

/** CSS transform placing the image. */
const transform = computed(() => `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})`)
/** Zoom factor shown in the toolbar. */
const percent = computed(() => `${Math.round(view.value.scale * 100)}%`)

/** Keeps the image fitted while the inspector is resized, unless the user zoomed or panned away. */
const observer = new ResizeObserver(() => {
  if (status.value === 'ready' && fitted) fit(fitted.offset)
})
watch(viewport, (element, previous) => {
  if (previous) observer.unobserve(previous)
  if (element) observer.observe(element)
})
onScopeDispose(() => observer.disconnect())
</script>

<template>
  <div class="histoire-designs-image">
    <div class="histoire-designs-image-tools" role="group" aria-label="Zoom">
      <HstButton color="flat" icon-only aria-label="Zoom out" title="Zoom out" :disabled="status !== 'ready'" @click="zoomCenter(1 / ZOOM_STEP)">
        <BuiltinIcon icon="zoom-out" :size="16" />
      </HstButton>
      <output class="histoire-designs-zoom">{{ percent }}</output>
      <HstButton color="flat" icon-only aria-label="Zoom in" title="Zoom in" :disabled="status !== 'ready'" @click="zoomCenter(ZOOM_STEP)">
        <BuiltinIcon icon="zoom-in" :size="16" />
      </HstButton>
      <HstButton color="flat" :disabled="status !== 'ready'" @click="fit()">
        Fit
      </HstButton>
      <HstButton color="flat" :disabled="status !== 'ready'" @click="center(1)">
        100%
      </HstButton>
    </div>
    <div
      ref="viewport"
      class="histoire-designs-image-viewport"
      role="group"
      tabindex="0"
      :aria-label="design.alt || design.name"
      :data-panning="panning || undefined"
      @wheel.prevent="onWheel"
      @keydown="onKeyDown"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img
        v-show="status === 'ready'"
        :key="design.src"
        :src="design.src"
        :alt="design.alt"
        :style="{ transform }"
        draggable="false"
        @load="onLoad"
        @error="status = 'error'"
      >
      <WorkbenchLoadingState v-if="status === 'loading'" class="histoire-designs-overlay" title="Loading image" />
      <WorkbenchErrorState v-else-if="status === 'error'" class="histoire-designs-overlay" title="Image unavailable">
        {{ design.src }}
      </WorkbenchErrorState>
    </div>
  </div>
</template>
