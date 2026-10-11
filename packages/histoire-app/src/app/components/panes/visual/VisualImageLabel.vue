<script setup lang="ts">
import type { VisualSize } from './zoom.js'

defineProps<{
  /** Image or comparison name. */
  label: string
  /** Optional original baseline size. */
  dimensions?: VisualSize
  /** Align label with frame's right edge (slider's Current side). */
  right?: boolean
}>()
</script>

<template>
  <span class="image-label" :class="{ right }">{{ label }}<span v-if="dimensions"> · {{ dimensions.width }} × {{ dimensions.height }}</span></span>
</template>

<style scoped>
/* Sits in scroll pane's top padding, above image frame, so it never covers captured pixels. */
.image-label { position: absolute; left: 0; bottom: 100%; margin-bottom: 8px; max-width: 100%; color: var(--histoire-muted); font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.image-label.right { left: auto; right: 0; }
</style>
