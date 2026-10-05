<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { shallowRef, watch } from 'vue'
import { useOverflowToolbar } from '../../base/overflow/context.js'
import BasePopover from '../../base/popover/BasePopover.vue'
import { useCanvasPopoverBounds } from './bounds.js'
import ToolbarButton from './ToolbarButton.vue'

/** Existing controlled identity keeps tool panels mutually exclusive. */
const props = defineProps<{
  /** Stable panel identity shared by toolbar owner. */
  id: string
  /** Currently open tool panel. */
  open: string | null
  /** Accessible panel and trigger name. */
  label: string
  /** Optional Carbon trigger glyph. */
  icon?: string
  /** Preferred width before canvas clamping. */
  width?: number
}>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const trigger = shallowRef<HTMLElement | null>(null)
const { bounds, overlayTarget } = useCanvasPopoverBounds(() => trigger.value)
const { toolbar, overflow } = useOverflowToolbar()

/** Keep actual native trigger identity across item Teleports. */
function setTrigger(element: Element | ComponentPublicInstance | null): void {
  trigger.value = element && '$el' in element ? element.$el : element as HTMLElement | null
}

/** Shortcut-opened panels reveal their overflowed trigger before positioning. */
watch(() => props.open === props.id, (opened) => {
  if (opened && overflow?.value) toolbar?.reveal()
})
</script>

<template>
  <span class="histoire-toolbar-anchor">
    <ToolbarButton :ref="setTrigger" :label="label" :icon="icon" :pressed="open === id" menu-role="menuitem" aria-haspopup="dialog" :aria-expanded="open === id" @click="emit('update:open', open === id ? null : id)"><slot name="trigger" /></ToolbarButton>
    <BasePopover class="histoire-toolbar-popover" :open="open === id" :anchor="trigger" :label="label" :width="width" :overlay-target="overlayTarget" :bounds="bounds" @update:open="emit('update:open', null)">
      <template #default="slot"><slot :close="slot.close" /></template>
    </BasePopover>
  </span>
</template>

<style scoped>
.histoire-toolbar-anchor { display: inline-flex; }
</style>
