<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { createPanelResizeController } from './panel-resize.js'

const props = defineProps<{
  /** Accessible label names the panel being resized. */
  label: string
  /** Region controlled by this separator. */
  controls: string
  /** Logical edge where the drag handle is rendered. */
  edge: 'start' | 'end'
  /** Effective width rendered by the parent. */
  modelValue: number
  /** Current minimum inline size within the host. */
  min: number
  /** Current maximum inline size within the host. */
  max: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const handle = ref<HTMLElement>()
const ownerDocument = computed(() => handle.value?.ownerDocument)
const ownerWindow = computed(() => ownerDocument.value?.defaultView ?? undefined)
const controller = createPanelResizeController({ edge: props.edge, getWidth: () => props.modelValue, getBounds: () => ({ min: props.min, max: props.max }), setWidth: value => emit('update:modelValue', value), getDirection: () => ownerWindow.value?.getComputedStyle(handle.value!).direction === 'rtl' ? 'rtl' : 'ltr' })
useEventListener(ownerDocument, 'pointermove', controller.onPointerMove, { capture: true, passive: false })
useEventListener(ownerDocument, ['pointerup', 'pointercancel'], controller.onPointerEnd, { capture: true })
useEventListener(ownerWindow, 'blur', controller.release)
onBeforeUnmount(controller.close)
</script>

<template>
  <div ref="handle" class="histoire-panel-resize-handle" :data-edge="edge" :data-resizing="controller.active.value" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label" :aria-controls="controls" :aria-valuenow="modelValue" :aria-valuemin="min" :aria-valuemax="max" :aria-valuetext="`${Math.round(modelValue)} pixels`" @pointerdown="controller.onPointerDown" @lostpointercapture="controller.onPointerEnd" @keydown="controller.onKeyDown" />
</template>

<style scoped>
.histoire-panel-resize-handle { position: absolute; inset-block: 0; width: 8px; z-index: 2; cursor: col-resize; touch-action: none; user-select: none; }
.histoire-panel-resize-handle[data-edge="end"] { inset-inline-end: 0; }
.histoire-panel-resize-handle[data-edge="start"] { inset-inline-start: 0; }
.histoire-panel-resize-handle::after { content: ''; position: absolute; inset-block: 0; inset-inline-start: 3px; width: 1px; background: transparent; }
.histoire-panel-resize-handle:hover::after, .histoire-panel-resize-handle[data-resizing="true"]::after, .histoire-panel-resize-handle:focus-visible::after { background: var(--histoire-accent); }
.histoire-panel-resize-handle:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
</style>
