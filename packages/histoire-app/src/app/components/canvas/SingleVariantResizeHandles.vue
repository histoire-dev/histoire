<script setup lang="ts">
import type { SingleResizeAxis, SingleResizeSize } from './single-resize.js'
import { useElementBounding, useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
/** Pointer input clears keyboard focus feedback even when programmatic focus persists. */
const keyboardInput = ref(false)
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
useEventListener(ownerDocument, 'keydown', () => keyboardInput.value = true, { capture: true })
useEventListener(ownerDocument, 'pointerdown', () => keyboardInput.value = false, { capture: true })
watch(controller.active, active => emit('update:active', active), { immediate: true })
onBeforeUnmount(() => {
  controller.close()
  emit('update:active', false)
})
</script>

<template>
  <div class="histoire-single-resize-handles" :style="position" :data-active="controller.active.value" :data-keyboard-input="keyboardInput">
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
.histoire-single-resize-handles { position: absolute; z-index: 4; pointer-events: none; }
.histoire-single-resize-handle { --resize-color: transparent; position: absolute; pointer-events: auto; touch-action: none; user-select: none; outline: none; }
.histoire-single-resize-handle.is-both { --resize-color: color-mix(in srgb, var(--histoire-muted) 40%, transparent); }
.histoire-single-resize-handle:focus { outline: none; }
.histoire-single-resize-handle::after { content: ''; position: absolute; border-radius: 1px; background: transparent; }
/* Highlight the frame edge for pointer and keyboard resizing. */
.histoire-single-resize-handle:hover, .histoire-single-resize-handles[data-keyboard-input="true"] .histoire-single-resize-handle:focus-visible, .histoire-single-resize-handles[data-active="true"] .histoire-single-resize-handle { --resize-color: var(--histoire-accent); }
/* Keep generous outside hit areas while edge marks follow the frame border. */
.is-width { inset-block: 7px; inset-inline-end: -8px; width: 12px; cursor: ew-resize; }
.is-width::after { inset-block: 0; inset-inline-start: 3px; width: 1px; background: var(--resize-color); }
.is-height { inset-inline: 7px; bottom: -8px; height: 12px; cursor: ns-resize; }
.is-height::after { inset-inline: 0; top: 3px; height: 1px; background: var(--resize-color); }
.is-both { inset-inline-end: -8px; bottom: -8px; width: 18px; height: 18px; cursor: nwse-resize; }
/* Match the frame's 7px radius and outer edges; only the hit area extends outside. */
.is-both::after { inset-inline-end: 8px; bottom: 8px; box-sizing: border-box; width: 7px; height: 7px; border-inline-end: 2px solid var(--resize-color); border-bottom: 2px solid var(--resize-color); border-end-end-radius: 7px; }
</style>
