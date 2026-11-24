<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Variant width in screen pixels. */
  width: number
  /** Variant height in screen pixels. */
  height: number
  /** Gutter around the variant in screen pixels. */
  padding: number
  /** Contrast color of the frame background; the workbench text color when it has none. */
  color?: string
}>()

/** Distance between a mark and the variant edge it extends. */
const GAP = 4
/** Longest mark, kept inside the gutter. */
const MAX_LENGTH = 12

/** Crop marks extend each variant corner outward, horizontally and vertically. */
const path = computed(() => {
  const length = Math.min(MAX_LENGTH, props.padding - GAP * 2)
  if (length < 2) return ''
  const left = Math.round(props.padding) + 0.5
  const top = left
  const right = Math.round(props.padding + props.width) - 0.5
  const bottom = Math.round(props.padding + props.height) - 0.5
  return ([[left, top, -1, -1], [right, top, 1, -1], [left, bottom, -1, 1], [right, bottom, 1, 1]] as const)
    .map(([x, y, dx, dy]) => `M${x + dx * GAP} ${y}h${dx * length}M${x} ${y + dy * GAP}v${dy * length}`)
    .join('')
})
</script>

<template>
  <svg v-if="path" class="histoire-frame-aligners htw:absolute htw:inset-0 htw:size-full htw:pointer-events-none htw:text-text htw:opacity-30 htw:z-[1]" :style="{ color }" aria-hidden="true">
    <path :d="path" fill="none" stroke="currentColor" stroke-width="1" shape-rendering="crispEdges" />
  </svg>
</template>
