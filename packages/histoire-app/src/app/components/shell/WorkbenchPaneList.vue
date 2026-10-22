<script setup lang="ts">
import './workbench-pane.css'

defineSlots<{
  /** Rows padded by `--histoire-pane-row-inset`, so their content lines up with the pane gutter. */
  default: () => any
}>()
</script>

<template>
  <div class="workbench-pane-list">
    <slot />
  </div>
</template>
