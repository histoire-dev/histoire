<script setup lang="ts">
import type { CanvasBackground } from '../../util/background.js'
import { computed } from 'vue'
import { usePresetConfigStore } from '../../stores/presets-config.js'
import { getBackgroundContrastColor } from '../../util/background.js'
import { histoireConfig } from '../../util/config.js'

const props = defineProps<{
  /** Variant width in screen pixels. */
  width: number
  /** Variant height in screen pixels. */
  height: number
  /** Gutter around the variant in screen pixels. */
  padding: number
  /** Frame background; its contrast color tints the marks, else the workbench text color. */
  background: CanvasBackground
}>()

const presets = usePresetConfigStore()
const color = computed(() => getBackgroundContrastColor(props.background, presets?.backgroundPresets.value ?? histoireConfig.backgroundPresets ?? []))

/** Distance between a mark and the variant edge it extends. */
const GAP = 4
/** Longest mark, kept inside the gutter. */
const MAX_LENGTH = 8

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
  <svg v-if="path" class="histoire-frame-aligners htw:absolute htw:inset-0 htw:size-full htw:pointer-events-none htw:text-text htw:opacity-15 htw:z-[1]" :style="{ color }" aria-hidden="true">
    <path :d="path" fill="none" stroke="currentColor" stroke-width="1" shape-rendering="crispEdges" />
  </svg>
</template>
