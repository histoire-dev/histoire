<script setup lang="ts">
import './workbench-pane.css'

defineSlots<{
  /** Filters or section switches; a button group fills the row. */
  default: () => any
}>()
</script>

<template>
  <div class="workbench-pane-toolbar">
    <slot />
  </div>
</template>
