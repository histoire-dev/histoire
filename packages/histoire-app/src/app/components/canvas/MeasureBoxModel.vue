<script setup lang="ts">
import type { HistoireElementSpacing } from '@histoire/shared'
import { computed } from 'vue'

const props = defineProps<{
  /** Element border box in client pixels. */
  box: { left: number, top: number, width: number, height: number }
  /** Computed padding in frame CSS pixels. */
  padding: HistoireElementSpacing
  /** Computed margin in frame CSS pixels. */
  margin: HistoireElementSpacing
  /** Frame-to-client scale per axis. */
  scale: { x: number, y: number }
}>()

/** Spacing as border widths, so one element tints the whole ring without covering content. */
function ring(spacing: HistoireElementSpacing): string {
  const { x, y } = props.scale
  // Negative margins can't be drawn as a ring.
  return [spacing.top * y, spacing.right * x, spacing.bottom * y, spacing.left * x].map(value => `${Math.max(0, value)}px`).join(' ')
}

const paddingStyle = computed(() => ({
  left: `${props.box.left}px`,
  top: `${props.box.top}px`,
  width: `${props.box.width}px`,
  height: `${props.box.height}px`,
  borderWidth: ring(props.padding),
}))

const marginStyle = computed(() => {
  const { x, y } = props.scale
  const margin = props.margin
  return {
    left: `${props.box.left - Math.max(0, margin.left) * x}px`,
    top: `${props.box.top - Math.max(0, margin.top) * y}px`,
    width: `${props.box.width + (Math.max(0, margin.left) + Math.max(0, margin.right)) * x}px`,
    height: `${props.box.height + (Math.max(0, margin.top) + Math.max(0, margin.bottom)) * y}px`,
    borderWidth: ring(margin),
  }
})
</script>

<template>
  <div class="histoire-measure-spacing margin" :style="marginStyle" />
  <div class="histoire-measure-spacing padding" :style="paddingStyle" />
</template>

<style scoped>
.histoire-measure-spacing { position: fixed; z-index: 25; box-sizing: border-box; border-style: solid; pointer-events: none; }
.margin { border-color: rgb(var(--histoire-measure-margin-rgb) / .25); }
.padding { border-color: rgb(var(--histoire-measure-padding-rgb) / .3); }
</style>
