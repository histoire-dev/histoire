<script setup lang="ts">
import { HstPulsatingDisc } from '@histoire/controls/vue'
</script>

<template>
  <span class="histoire-canvas-loading-indicator" aria-hidden="true">
    <HstPulsatingDisc :size="16" />
  </span>
</template>

<style scoped>
.histoire-canvas-loading-indicator { display: inline-flex; color: var(--histoire-muted); opacity: .5; pointer-events: none; }
</style>
