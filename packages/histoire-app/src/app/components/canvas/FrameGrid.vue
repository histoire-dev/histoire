<script setup lang="ts">
import type { CanvasFrameLayout } from './frame-layout.js'

defineProps<{
  /** Positioned frame registry retains placeholders and selection. */
  frames: readonly CanvasFrameLayout[]
}>()
</script>

<template>
  <div class="histoire-frame-grid" role="group" aria-label="Story variants">
    <slot v-for="(frame, index) in frames" :key="frame.id" :frame="frame" :index="index" />
  </div>
</template>

<style scoped>
.histoire-frame-grid { position: absolute; inset: 0; pointer-events: none; }
.histoire-frame-grid :deep(.histoire-canvas-frame) { pointer-events: auto; }
</style>
