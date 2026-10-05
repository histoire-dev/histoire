<script setup lang="ts">
import type { HistoireSession } from '@histoire/sdk'
import { MEASURE_REQUEST } from '@histoire/shared'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useCanvasFrames, useCanvasPointerPan, useCanvasStore } from '../../composables/canvas-settings.js'
import { createMeasureController, sameMeasureOwner } from './measure-controller.js'
import { getMeasureOwner } from './measure-owner.js'

const canvas = useCanvasStore()
const frames = useCanvasFrames()
const pointerPan = useCanvasPointerPan()
const context = useHistoireContext()
const ownedSnapshot = shallowRef<ReturnType<HistoireSession['getSnapshot']>>()
const tick = ref(0)
let scheduled = 0
let position = { x: 0, y: 0 }
let panPointerId: number | undefined
let panButton: number | undefined
let suppressClick = false
let stopSession = () => {}
const frame = computed(() => canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null)
const owner = computed(() => getMeasureOwner(frame.value, ownedSnapshot.value, canvas.tool === 'measure'))
const measurement = createMeasureController({ getOwner: () => owner.value, post: (current, requestId, point) => frames.postToFrame(current.frameId, {
  type: MEASURE_REQUEST,
  ...point,
  requestId,
  storyId: current.storyId,
  variantId: current.variantId,
}) })
const { result, locked } = measurement
const bounds = computed(() => {
  void [tick.value, canvas.panOffset.x, canvas.panOffset.y, canvas.effectiveZoom]
  return frame.value?.iframe?.getBoundingClientRect() ?? null
})
const enabled = computed(() => Boolean(owner.value && bounds.value))
const box = computed(() => {
  const rect = result.value?.rect
  const origin = bounds.value
  if (!rect || !origin || !frame.value) return null
  const sx = origin.width / frame.value.rect.width
  const sy = origin.height / frame.value.rect.height
  return { left: origin.left + rect.x * sx, top: origin.top + rect.y * sy, width: rect.width * sx, height: rect.height * sy }
})
const guides = computed(() => {
  const element = box.value
  const origin = bounds.value
  const metrics = result.value?.rect
  const current = frame.value
  if (!element || !origin || !metrics || !current) return []
  return [
    { id: 'top', vertical: true, x: element.left + element.width / 2, y: origin.top, length: element.top - origin.top, value: metrics.top },
    { id: 'right', vertical: false, x: element.left + element.width, y: element.top + element.height / 2, length: origin.right - element.left - element.width, value: current.rect.width - metrics.right },
    { id: 'bottom', vertical: true, x: element.left + element.width / 2, y: element.top + element.height, length: origin.bottom - element.top - element.height, value: current.rect.height - metrics.bottom },
    { id: 'left', vertical: false, x: origin.left, y: element.top + element.height / 2, length: element.left - origin.left, value: metrics.left },
  ].filter(guide => guide.length >= 0)
})

/** Overlay coordinates convert through registry so canvas zoom never distorts CSS pixel requests. */
function move(event: PointerEvent) {
  if (locked.value) return
  position = { x: event.clientX, y: event.clientY }
  if (scheduled) return
  scheduled = requestAnimationFrame(() => {
    scheduled = 0
    const current = frame.value
    if (!enabled.value || !current) return
    const local = frames.clientToFrame(current.id, position)
    if (!local) return
    measurement.hover(local)
  })
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
onMounted(() => {
  window.addEventListener('message', measurement.receive)
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  retireInput()
  measurement.close()
  stopSession()
  window.removeEventListener('message', measurement.receive)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <Teleport v-if="enabled && bounds" :to="context.overlay.value ?? context.root.value ?? 'body'">
    <div class="histoire-measure-hit" role="button" tabindex="0" :aria-label="locked ? 'Unlock measurement' : 'Lock measurement'" :aria-pressed="locked" :style="{ left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }" @pointerdown.prevent.stop="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerCancel" @pointerleave="leave" @click.prevent.stop="click" @keydown.enter.prevent.stop="measurement.toggle()" @keydown.space.prevent.stop="measurement.toggle()" />
    <div v-if="box && result" class="histoire-measure-box" :data-locked="locked" :style="{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, pointerEvents: 'none' }">
      <span class="measure-size">{{ Math.round(result.rect.width) }} × {{ Math.round(result.rect.height) }}<span v-if="locked" class="measure-locked">Locked</span></span>
    </div>
    <div v-for="guide in guides" :key="guide.id" class="histoire-measure-guide" :class="{ vertical: guide.vertical }" :style="{ left: `${guide.x}px`, top: `${guide.y}px`, width: `${guide.vertical ? 1 : guide.length}px`, height: `${guide.vertical ? guide.length : 1}px`, pointerEvents: 'none' }">
      <span>{{ Math.round(guide.value) }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.histoire-measure-hit, .histoire-measure-box { position: fixed; z-index: 25; }
.histoire-measure-hit { cursor: crosshair; pointer-events: auto; }
.histoire-measure-hit:focus-visible { outline: 2px solid var(--histoire-measure); outline-offset: -2px; }
.histoire-measure-box { border: 1px solid var(--histoire-measure); background: rgb(var(--histoire-measure-rgb) / .05); pointer-events: none; color: #fff; font: 10px var(--histoire-font-mono); }
.measure-size, .histoire-measure-guide span { position: absolute; padding: 3px 5px; border-radius: 4px; background: var(--histoire-measure); white-space: nowrap; }
.measure-size { bottom: calc(100% + 5px); left: 50%; transform: translateX(-50%); }
.measure-locked { margin-inline-start: 6px; }
.histoire-measure-guide { position: fixed; z-index: 26; background: var(--histoire-measure); color: #fff; font: 10px var(--histoire-font-mono); }
.histoire-measure-guide span { bottom: 5px; left: 50%; transform: translateX(-50%); }
.histoire-measure-guide.vertical span { bottom: auto; top: 50%; left: 5px; transform: translateY(-50%); }
</style>
