<script setup lang="ts">
import type { StyleValue } from 'vue'
import { ref } from 'vue'

const props = defineProps<{
  /** Baseline image URL, shown left of separator. */
  baselineUrl?: string
  /** Current image URL, shown right of separator. */
  currentUrl?: string
  /** Zoomed baseline image size. */
  baselineStyle: StyleValue
  /** Zoomed current image size. */
  currentStyle: StyleValue
  /** Case label used in image alternative texts. */
  label?: string
}>()

const stage = ref<HTMLElement>()
/** Separator position as percentage of stage width. */
const position = ref(50)
let dragging = false

/** Map pointer horizontal coordinate to clamped separator percentage. */
function place(event: PointerEvent): void {
  const rect = stage.value?.getBoundingClientRect()
  if (rect?.width) {
    position.value = Math.min(100, Math.max(0, (event.clientX - rect.left) / rect.width * 100))
  }
}
/** Separator owns its pointer so image panning in parent scroll area does not start. */
function startDrag(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  event.stopPropagation()
  event.preventDefault()
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  place(event)
}
/** Follow captured pointer while dragging. */
function drag(event: PointerEvent): void {
  if (dragging) {
    place(event)
  }
}
/** Arrow keys nudge separator; Shift moves faster; Home/End jump to edges. */
function keyboard(event: KeyboardEvent): void {
  const step = event.shiftKey ? 10 : 1
  const next = {
    ArrowLeft: position.value - step,
    ArrowRight: position.value + step,
    Home: 0,
    End: 100,
  }[event.key]
  if (next !== undefined) {
    event.preventDefault()
    position.value = Math.min(100, Math.max(0, next))
  }
}
</script>

<template>
  <div ref="stage" class="visual-slider">
    <div class="layer">
      <img v-if="props.baselineUrl" :src="props.baselineUrl" :alt="`baseline image for ${props.label}`" :style="props.baselineStyle" draggable="false">
    </div>
    <div class="layer" :style="{ clipPath: `inset(0 0 0 ${position}%)` }">
      <img v-if="props.currentUrl" :src="props.currentUrl" :alt="`current image for ${props.label}`" :style="props.currentStyle" draggable="false">
    </div>
    <div
      class="separator"
      role="slider"
      tabindex="0"
      aria-label="Baseline and current separator"
      aria-orientation="horizontal"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(position)"
      :style="{ left: `${position}%` }"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="dragging = false"
      @lostpointercapture="dragging = false"
      @keydown="keyboard"
    >
      <span class="grip" />
    </div>
  </div>
</template>

<style scoped>
.visual-slider { position: relative; display: grid; width: max-content; }
.layer { grid-area: 1/1; }
img { display: block; max-width: none; user-select: none; }
.separator { position: absolute; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 12px; margin-left: -6px; cursor: ew-resize; touch-action: none; }
.separator::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: color-mix(in srgb, var(--histoire-code) 45%, transparent); }
/* Opposing sticky insets pin grip to scroll area's vertical middle, clamped inside separator. */
.grip { position: sticky; top: calc(50% - 8px); bottom: calc(50% - 8px); width: 6px; height: 16px; border-radius: 3px; background: var(--histoire-code); box-shadow: 0 0 0 2px light-dark(var(--histoire-surface), var(--histoire-text)), 0 1px 2px rgb(0 0 0 / 25%); }
.separator:focus-visible { outline: none; }
.separator:focus-visible .grip { outline: 2px solid var(--histoire-text); outline-offset: 2px; }
</style>
