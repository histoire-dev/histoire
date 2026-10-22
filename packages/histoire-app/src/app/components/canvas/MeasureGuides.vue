<script setup lang="ts">
import type { MeasureSegment } from './measure-geometry.js'
import type { MeasureLabel } from './measure-labels.js'
import { isVerticalSegment } from './measure-geometry.js'

defineProps<{
  /** Distance lines already projected to client pixels. */
  segments: readonly MeasureSegment[]
  /** Size and distance labels, already laid out without overlaps. */
  labels: readonly MeasureLabel[]
}>()

/** Axis-aligned line box for one segment. */
function lineStyle(segment: MeasureSegment) {
  const vertical = isVerticalSegment(segment)
  return {
    left: `${Math.min(segment.x1, segment.x2)}px`,
    top: `${Math.min(segment.y1, segment.y2)}px`,
    width: vertical ? '1px' : `${Math.abs(segment.x2 - segment.x1)}px`,
    height: vertical ? `${Math.abs(segment.y2 - segment.y1)}px` : '1px',
  }
}
</script>

<template>
  <div v-for="segment in segments" :key="segment.id" class="histoire-measure-guide" :data-equal="segment.equal || undefined" :style="lineStyle(segment)" />
  <span v-for="label in labels" :key="label.id" class="histoire-measure-label" :data-equal="label.equal || undefined" :style="{ left: `${label.x}px`, top: `${label.y}px` }">
    {{ label.text }}
  </span>
</template>

<style scoped>
.histoire-measure-guide { position: fixed; z-index: 26; pointer-events: none; background: var(--histoire-measure); }
.histoire-measure-label { position: fixed; z-index: 27; box-sizing: border-box; height: 18px; padding: 3px 5px; border-radius: 4px; background: var(--histoire-measure); color: #fff; font: 10px/12px var(--histoire-font-mono); white-space: nowrap; pointer-events: none; }
.histoire-measure-guide[data-equal], .histoire-measure-label[data-equal] { background: var(--histoire-measure-gap); }
</style>
