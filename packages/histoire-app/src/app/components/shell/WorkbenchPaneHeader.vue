<script setup lang="ts">
import './workbench-pane.css'

defineProps<{
  /** Pane title. */
  title: string
}>()
defineSlots<{
  /** Trailing pane actions (icon buttons, `WorkbenchPanelAction`). */
  default?: () => any
}>()
</script>

<template>
  <header class="workbench-pane-header">
    <h2>{{ title }}</h2>
    <slot />
  </header>
</template>
