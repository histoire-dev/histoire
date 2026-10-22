<script setup lang="ts">
import type { HistoireSession } from '@histoire/sdk'
import type { HistoireElementRect } from '@histoire/shared'
import { MEASURE_REQUEST } from '@histoire/shared'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { useCanvasFrames, useCanvasPointerPan, useCanvasStore } from '../../composables/canvas-settings.js'
import { isEditing } from '../../util/shortcuts.js'
import { createMeasureController, sameMeasureOwner } from './measure-controller.js'
import { rectDistances, repeatedGaps } from './measure-geometry.js'
import { measureLabels } from './measure-labels.js'
import { getMeasureOwner } from './measure-owner.js'
import MeasureBoxModel from './MeasureBoxModel.vue'
import MeasureGuides from './MeasureGuides.vue'

const canvas = useCanvasStore()
const frames = useCanvasFrames()
const pointerPan = useCanvasPointerPan()
const ownedSnapshot = shallowRef<ReturnType<HistoireSession['getSnapshot']>>()
const tick = ref(0)
let scheduled = 0
let position: { x: number, y: number } | null = null
/** Queued move compares with locked element instead of hovering. */
let comparing = false
let panPointerId: number | undefined
let panButton: number | undefined
let suppressClick = false
let stopSession = () => {}
const frame = computed(() => canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null)
const owner = computed(() => getMeasureOwner(frame.value, ownedSnapshot.value, canvas.tool === 'measure'))
const measurement = createMeasureController({ getOwner: () => owner.value, post: (current, requestId, query) => frames.postToFrame(current.frameId, {
  type: MEASURE_REQUEST,
  ...query,
  requestId,
  storyId: current.storyId,
  variantId: current.variantId,
}) })
const { result, target, locked } = measurement
const bounds = computed(() => {
  void [tick.value, canvas.panOffset.x, canvas.panOffset.y, canvas.effectiveZoom]
  return frame.value?.iframe?.getBoundingClientRect() ?? null
})
const enabled = computed(() => Boolean(owner.value && bounds.value))
/** Frame CSS pixels to client pixels; follows zoom, pan and viewport changes through `bounds`. */
const projection = computed(() => {
  const origin = bounds.value
  const current = frame.value
  if (!origin || !current || current.rect.width <= 0 || current.rect.height <= 0) return null
  return { left: origin.left, top: origin.top, x: origin.width / current.rect.width, y: origin.height / current.rect.height }
})

/** Project an element rect to a fixed-position client box. */
function project(rect: HistoireElementRect) {
  const scale = projection.value!
  return { left: scale.left + rect.left * scale.x, top: scale.top + rect.top * scale.y, width: rect.width * scale.x, height: rect.height * scale.y }
}

/** Measured element and compared target boxes with their size labels. */
const boxes = computed(() => {
  if (!projection.value) return []
  return [
    result.value && { id: 'main', box: project(result.value.rect), rect: result.value.rect, locked: locked.value },
    target.value && { id: 'target', box: project(target.value.rect), rect: target.value.rect, locked: false },
  ].filter(item => !!item)
})

/** Distances to compared target, or to parent plus repeated sibling gaps. */
const segments = computed(() => {
  const scale = projection.value
  const current = result.value
  if (!scale || !current) return []
  const frameSegments = target.value
    ? rectDistances(current.rect, target.value.rect)
    : [...rectDistances(current.rect, current.parentRect), ...(current.siblings ? repeatedGaps(current.siblings, current.index ?? -1) : [])]
  return frameSegments.map(segment => ({ ...segment, x1: scale.left + segment.x1 * scale.x, y1: scale.top + segment.y1 * scale.y, x2: scale.left + segment.x2 * scale.x, y2: scale.top + segment.y2 * scale.y }))
})

/** Non-overlapping size and distance labels. */
const labels = computed(() => measureLabels(boxes.value, segments.value))

/** Overlay coordinates convert through registry so canvas zoom never distorts CSS pixel requests. */
function move(event: PointerEvent) {
  position = { x: event.clientX, y: event.clientY }
  // Locked measurement only follows the pointer while Shift compares a target.
  if (locked.value && !event.shiftKey) return
  schedule(locked.value)
}

/** Inspect last pointer position on next frame, as hover or as compared target. */
function schedule(compare: boolean) {
  comparing = compare
  if (scheduled) return
  scheduled = requestAnimationFrame(() => {
    scheduled = 0
    const current = frame.value
    if (!enabled.value || !current || !position) return
    const local = frames.clientToFrame(current.id, position)
    if (!local) return
    if (comparing) measurement.inspectTarget(local)
    else measurement.hover(local)
  })
}

/** Pressing Shift over a locked measurement compares immediately; releasing it drops the target. */
function shiftKey(event: KeyboardEvent) {
  // Typing capitals in controls or comments must not compare.
  if (event.key !== 'Shift' || (event.type === 'keydown' && isEditing(event.target))) return
  if (event.type === 'keyup') {
    // A queued compare frame must not bring the target back after release.
    if (comparing) cancelMove()
    measurement.clearTarget()
  }
  else if (locked.value && position && !event.repeat) {
    schedule(true)
  }
}

/** Enter and Space toggle lock; held keys don't re-toggle. */
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) measurement.toggle()
}

/** Relay accepted gestures to viewport owner while preserving overlay pointer capture. */
function pointerDown(event: PointerEvent): void {
  // A browser dispatches primary click after pointerup. A new primary press
  // proves that old click was not delivered, so it cannot suppress this one.
  if (event.button === 0) suppressClick = false
  if (!pointerPan?.onPointerDown(event)) return
  panPointerId = event.pointerId
  panButton = event.button
  cancelMove()
}

/** Captured moves stay in shared client-space pan math, never measurement math. */
function pointerMove(event: PointerEvent): void {
  if (panPointerId === event.pointerId) {
    pointerPan?.onPointerMove(event)
    return
  }
  move(event)
}

/** Release relayed pointer before its synthetic click reaches measurement. */
function pointerEnd(event: PointerEvent): void {
  if (panPointerId !== event.pointerId) return
  // Middle button ends in auxclick. Only a primary pan owns a following
  // click, leaving later ordinary measurement clicks untouched.
  if (panButton === 0) suppressClick = Boolean(pointerPan?.onPointerUp(event))
  else pointerPan?.onPointerUp(event)
  panPointerId = undefined
  panButton = undefined
}

/** Cancellation releases capture but does not suppress later independent clicks. */
function pointerCancel(event: PointerEvent): void {
  if (panPointerId !== event.pointerId) return
  pointerPan?.onPointerCancel(event)
  panPointerId = undefined
  panButton = undefined
}

/** Retire queued pointer work before clicks, owner replacement, or teardown. */
function cancelMove() {
  if (scheduled) cancelAnimationFrame(scheduled)
  scheduled = 0
}

/** Retire overlay-owned input before its hit surface disappears or changes document. */
function retireInput(): void {
  cancelMove()
  if (panPointerId !== undefined) pointerPan?.release()
  panPointerId = undefined
  panButton = undefined
  suppressClick = false
}

/** Click freezes displayed box; without a box, inspect exact click point first. */
function click(event: MouseEvent) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  cancelMove()
  const current = frame.value
  const point = current && frames.clientToFrame(current.id, { x: event.clientX, y: event.clientY })
  measurement.toggle(point ?? undefined)
}

/** Leaving the hit surface clears hover only; clicked measurement stays visible. */
function leave() {
  if (panPointerId !== undefined) return
  cancelMove()
  position = null
  measurement.clearTarget()
  measurement.leave()
}

/** Viewport resizing changes client projection without changing frame CSS dimensions. */
function resize() {
  tick.value++
}
// Matrix measurements subscribe to their passive session, never canonical state.
watch(() => frame.value?.session, (session) => {
  stopSession()
  ownedSnapshot.value = session?.getSnapshot()
  stopSession = session?.subscribe(value => ownedSnapshot.value = value) ?? (() => {})
}, { immediate: true, flush: 'sync' })
watch(owner, (current, previous) => {
  // Session publications can update state without replacing the physical owner.
  if (!sameMeasureOwner(current, previous)) retireInput()
  else cancelMove()
  measurement.synchronize()
}, { flush: 'sync' })
// Hint bar reads tool state and drives navigation through the store.
watchEffect(() => {
  canvas.measure = enabled.value
    ? { locked: locked.value, siblings: (result.value?.siblings?.length ?? 0) > 1, path: result.value?.path ?? [], navigate: measurement.navigate, unlock: () => locked.value && measurement.toggle() }
    : null
})
onMounted(() => {
  window.addEventListener('message', measurement.receive)
  window.addEventListener('keydown', shiftKey)
  window.addEventListener('keyup', shiftKey)
  window.addEventListener('blur', measurement.clearTarget)
  window.addEventListener('resize', resize)
  window.addEventListener('scroll', resize, true)
})
onBeforeUnmount(() => {
  retireInput()
  measurement.close()
  stopSession()
  window.removeEventListener('message', measurement.receive)
  window.removeEventListener('keydown', shiftKey)
  window.removeEventListener('keyup', shiftKey)
  window.removeEventListener('blur', measurement.clearTarget)
  canvas.measure = null
  window.removeEventListener('resize', resize)
  window.removeEventListener('scroll', resize, true)
})
</script>

<template>
  <!-- Rendered inside the canvas, under its toolbars and hint bar, so canvas chrome always wins interaction. -->
  <div v-if="enabled && bounds" class="histoire-measure-layer">
    <div class="histoire-measure-hit" role="button" tabindex="0" :aria-label="locked ? 'Unlock measurement' : 'Lock measurement'" :aria-pressed="locked" :style="{ left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }" @pointerdown.prevent.stop="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerCancel" @pointerleave="leave" @click.prevent.stop="click" @keydown="keydown" />
    <MeasureBoxModel v-if="result && !target && projection" :box="project(result.rect)" :padding="result.padding" :margin="result.margin" :scale="projection" />
    <div v-for="item in boxes" :key="item.id" class="histoire-measure-box" :data-locked="item.locked" :data-target="item.id === 'target' || undefined" :style="{ left: `${item.box.left}px`, top: `${item.box.top}px`, width: `${item.box.width}px`, height: `${item.box.height}px` }" />
    <MeasureGuides :segments="segments" :labels="labels" />
  </div>
</template>

<style scoped>
/* Own stacking context below canvas chrome (hint bar z-index 4, toolbar 10); fixed children keep viewport coordinates. */
.histoire-measure-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.histoire-measure-hit, .histoire-measure-box { position: fixed; z-index: 25; }
.histoire-measure-hit { cursor: crosshair; pointer-events: auto; }
.histoire-measure-hit:focus-visible { outline: 2px solid var(--histoire-measure); outline-offset: -2px; }
.histoire-measure-box { border: 1px solid var(--histoire-measure); background: rgb(var(--histoire-measure-rgb) / .05); pointer-events: none; }
.histoire-measure-box[data-target] { border-style: dashed; }
</style>
