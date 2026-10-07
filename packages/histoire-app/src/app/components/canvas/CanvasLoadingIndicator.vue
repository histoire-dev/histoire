<script setup lang="ts">
import PulsatingDisc from '../base/PulsatingDisc.vue'
</script>

<template>
  <span class="histoire-canvas-loading-indicator" aria-hidden="true">
    <PulsatingDisc :size="16" />
  </span>
</template>

<style scoped>
.histoire-canvas-loading-indicator { display: inline-flex; color: var(--histoire-muted); opacity: .5; pointer-events: none; }
</style>
