<script setup lang="ts">
import type { CanvasFrameLayout } from './frame-layout.js'

/** List arrangement keeps one semantic row per variant; caller owns preview lifetime. */
defineProps<{ frames: readonly CanvasFrameLayout[] }>()
</script>

<template>
  <div class="histoire-frame-list" role="list" aria-label="Story variants">
    <div v-for="(frame, index) in frames" :key="frame.id" class="histoire-frame-list-row" role="listitem">
      <slot :frame="frame" :index="index" />
    </div>
  </div>
</template>

<style scoped>
.histoire-frame-list { display: flex; flex-direction: column; gap: 24px; }
.histoire-frame-list-row { min-width: 0; }
</style>
