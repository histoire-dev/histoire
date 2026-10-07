<script setup lang="ts">
import type { SingleResizeAxis, SingleResizeSize } from './single-resize.js'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, watch } from 'vue'
import { createSingleResizeController, SINGLE_RESIZE_MAX, SINGLE_RESIZE_MIN } from './single-resize.js'

const props = defineProps<{
  /** Native scrolling owner for centered and overflow geometry. */
  surface?: HTMLElement
  /** Displayed frame shell whose edges own the grips. */
  frame?: HTMLElement
  /** Current physical unscaled viewport dimensions. */
  size: SingleResizeSize
  /** Current fixed display scale. */
  zoom: number
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

const controller = createSingleResizeController({
  getSize: () => props.size,
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
  <div class="histoire-single-resize-handles" :data-active="controller.active.value">
    <div
      class="histoire-single-resize-handle is-width"
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
    <div
      class="histoire-single-resize-handle is-height"
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
    <div
      class="histoire-single-resize-handle is-both"
      data-test-id="single-resize-both"
      tabindex="-1"
      aria-hidden="true"
      @pointerdown="pointerDown('both', $event)"
      @lostpointercapture="controller.onPointerEnd"
    />
  </div>
</template>

<style scoped>
.histoire-single-resize-handles { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.histoire-single-resize-handle { position: absolute; pointer-events: auto; touch-action: none; user-select: none; }
.histoire-single-resize-handle::after { content: ''; position: absolute; border-radius: 1px; background: transparent; }
.histoire-single-resize-handle:hover::after, .histoire-single-resize-handle:focus-visible::after, .histoire-single-resize-handles[data-active="true"] .histoire-single-resize-handle::after { background: var(--histoire-accent); }
.histoire-single-resize-handle:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
/* Grips must not create scrollbars or false camera overflow when frame fits exactly. */
.is-width { inset-block: 0 12px; inset-inline-end: 0; width: 12px; cursor: ew-resize; }
.is-width::after { inset-block: 0; inset-inline-start: 5px; width: 2px; }
.is-height { inset-inline: 0 12px; bottom: 0; height: 12px; cursor: ns-resize; }
.is-height::after { inset-inline: 0; top: 5px; height: 2px; }
.is-both { inset-inline-end: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; }
.is-both::after { inset-inline-end: 5px; bottom: 5px; width: 6px; height: 6px; border-inline-end: 2px solid transparent; border-bottom: 2px solid transparent; background: transparent !important; }
.is-both:hover::after, .histoire-single-resize-handles[data-active="true"] .is-both::after { border-color: var(--histoire-accent); }
</style>
