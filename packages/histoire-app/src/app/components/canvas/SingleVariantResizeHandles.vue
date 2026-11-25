<script setup lang="ts">
import type { SingleResizeAxis, SingleResizeSize } from './single-resize.js'
import { useElementBounding, useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useKeyboardInput } from '../../composables/keyboard-input.js'
import { createSingleResizeController, SINGLE_RESIZE_MAX, SINGLE_RESIZE_MIN } from './single-resize.js'
import SingleVariantResizeHandle from './SingleVariantResizeHandle.vue'

const props = defineProps<{
  /** Native scrolling owner for centered and overflow geometry. */
  surface?: HTMLElement
  /** Displayed frame shell whose edges own the grips. */
  frame?: HTMLElement
  /** Current physical unscaled viewport dimensions. */
  size: SingleResizeSize
  /** Current fixed display scale. */
  zoom: number
  /** Story gutter between frame edge and viewport, in logical pixels. */
  inset?: number
}>()

const emit = defineEmits<{
  /** Active pointer ownership changed. */
  'update:active': [active: boolean]
  /** First effective change must freeze automatic sizing and zoom. */
  'start': []
  /** Live physical dimensions changed. */
  'resize': [size: SingleResizeSize]
  /** One pointer or keyboard operation completed. */
  'commit': [size: SingleResizeSize]
}>()

const ownerDocument = computed(() => props.frame?.ownerDocument)
const ownerWindow = computed(() => ownerDocument.value?.defaultView ?? undefined)
const keyboardInput = useKeyboardInput(ownerDocument)
const surfaceBounds = useElementBounding(() => props.surface)
const frameBounds = useElementBounding(() => props.frame)
/** Project scroll content into its sibling overlay without extending scroll bounds. */
const position = computed(() => ({
  left: `${frameBounds.left.value - surfaceBounds.left.value}px`,
  top: `${frameBounds.top.value - surfaceBounds.top.value}px`,
  width: `${frameBounds.width.value}px`,
  height: `${frameBounds.height.value}px`,
  visibility: frameBounds.width.value > 0 && frameBounds.height.value > 0 ? 'visible' as const : 'hidden' as const,
}))
// Surface resizing or moving can recenter the frame without resizing the frame itself.
watch([surfaceBounds.left, surfaceBounds.top, surfaceBounds.width, surfaceBounds.height, () => props.size.width, () => props.size.height, () => props.zoom], frameBounds.update, { flush: 'post' })

const controller = createSingleResizeController({
  getSize: () => props.size,
  getInset: () => props.inset ?? 0,
  getGeometry: () => {
    if (!props.surface || !props.frame) return
    const surface = props.surface.getBoundingClientRect()
    return {
      frame: props.frame.getBoundingClientRect(),
      surface: {
        left: surface.left,
        top: surface.top,
        width: props.surface.clientWidth,
        scrollLeft: props.surface.scrollLeft,
        scrollTop: props.surface.scrollTop,
      },
      zoom: props.zoom,
    }
  },
  onStart: () => emit('start'),
  onResize: size => emit('resize', size),
  onCommit: size => emit('commit', size),
})

/** Bind one physical grip to shared pointer ownership. */
function pointerDown(axis: SingleResizeAxis, event: PointerEvent): void {
  controller.onPointerDown(axis, event)
}

/** Bind one accessible separator to its logical dimension. */
function keyDown(axis: 'width' | 'height', event: KeyboardEvent): void {
  controller.onKeyDown(axis, event)
}

useEventListener(ownerDocument, 'pointermove', controller.onPointerMove, { capture: true, passive: false })
useEventListener(ownerDocument, ['pointerup', 'pointercancel'], controller.onPointerEnd, { capture: true })
useEventListener(ownerWindow, 'blur', () => controller.release())
watch(controller.active, active => emit('update:active', active), { immediate: true })
onBeforeUnmount(() => {
  controller.close()
  emit('update:active', false)
})
</script>

<template>
  <div class="htw:group/handles htw:absolute htw:z-[4] htw:pointer-events-none" :style="position" :data-active="controller.active.value" :data-keyboard-input="keyboardInput">
    <SingleVariantResizeHandle
      class="htw:inset-y-[7px] htw:-end-2 htw:w-3 htw:cursor-ew-resize htw:after:inset-y-0 htw:after:start-[3px] htw:after:w-px htw:after:bg-current"
      data-test-id="single-resize-width"
      role="separator"
      tabindex="0"
      aria-label="Resize viewport width"
      aria-orientation="vertical"
      :aria-valuemin="SINGLE_RESIZE_MIN"
      :aria-valuemax="SINGLE_RESIZE_MAX"
      :aria-valuenow="size.width"
      :aria-valuetext="`${size.width} pixels`"
      @pointerdown="pointerDown('width', $event)"
      @lostpointercapture="controller.onPointerEnd"
      @keydown="keyDown('width', $event)"
    />
    <SingleVariantResizeHandle
      class="htw:inset-x-[7px] htw:-bottom-2 htw:h-3 htw:cursor-ns-resize htw:after:inset-x-0 htw:after:top-[3px] htw:after:h-px htw:after:bg-current"
      data-test-id="single-resize-height"
      role="separator"
      tabindex="0"
      aria-label="Resize viewport height"
      aria-orientation="horizontal"
      :aria-valuemin="SINGLE_RESIZE_MIN"
      :aria-valuemax="SINGLE_RESIZE_MAX"
      :aria-valuenow="size.height"
      :aria-valuetext="`${size.height} pixels`"
      @pointerdown="pointerDown('height', $event)"
      @lostpointercapture="controller.onPointerEnd"
      @keydown="keyDown('height', $event)"
    />
    <SingleVariantResizeHandle
      corner
      class="htw:-end-2 htw:-bottom-2 htw:size-[18px] htw:cursor-nwse-resize htw:after:end-2 htw:after:bottom-2 htw:after:box-border htw:after:size-[7px] htw:after:border-e-2 htw:after:border-b-2 htw:after:border-solid htw:after:border-current htw:after:rounded-ee-[7px]"
      data-test-id="single-resize-both"
      tabindex="-1"
      aria-hidden="true"
      @pointerdown="pointerDown('both', $event)"
      @lostpointercapture="controller.onPointerEnd"
    />
  </div>
</template>
