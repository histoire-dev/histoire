<script setup lang="ts">
import { useHistoireContext } from '@histoire/vue/internal'
import BasePopover from '../../base/popover/BasePopover.vue'

defineProps<{
  /** Trigger owning popover focus and position. */
  anchor: HTMLElement | null
}>()
const emit = defineEmits<{
  /** Popover dismissed. */
  close: []
}>()
// Mounted only while open so closed triggers need no workbench context.
const context = useHistoireContext()
</script>

<template>
  <BasePopover open :anchor="anchor" label="Agent session" role="dialog" :width="280" align="start" side="top" :overlay-target="context.overlay.value ?? context.root.value" @update:open="emit('close')">
    <slot />
  </BasePopover>
</template>
