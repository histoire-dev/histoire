<script setup lang="ts">
import { HstButton, HstSwitch } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useUiSettingsStore } from '../../../stores/settings.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import ToolbarPopover from './ToolbarPopover.vue'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const settings = useUiSettingsStore()
const shortcuts = useShortcutRegistry()
const label = computed(() => canvas.zoom === 'fit' ? 'Fit' : `${Math.round(canvas.zoom * 100)}%`)

/** Zoom ownership respects optional per-frame synchronization preference. */
function zoom(value: number | 'fit') {
  canvas.setZoom(value)
  emit('update:open', null)
}

/** Selection zoom uses canvas geometry rather than preview document scaling. */
function selection() {
  const frame = canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null
  if (frame) canvas.zoomToFrame(frame.rect)
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="zoom" :open="open" label="Zoom level" :width="240" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="zoom-label">{{ label }}</span>
    </template>
    <HstButton color="flat" class="popover-row" :aria-pressed="canvas.zoom === 'fit'" @click="zoom('fit')">
      Fit to canvas<span class="popover-meta">{{ shortcuts?.hint('canvas.fit') || '⇧1' }}</span>
    </HstButton>
    <HstButton color="flat" class="popover-row" :disabled="!canvas.selectedFrame" @click="selection">
      Zoom to selection<span class="popover-meta">{{ shortcuts?.hint('canvas.selection') || '⇧2' }}</span>
    </HstButton>
    <HstButton v-for="value in [.25, .5, 1, 2]" :key="value" color="flat" class="popover-row" :aria-pressed="canvas.zoom === value" @click="zoom(value)">
      {{ value * 100 }}%<span v-if="value === 1" class="popover-meta">{{ shortcuts?.hint('canvas.actual') || '⇧0' }}</span>
    </HstButton>
    <template v-if="settings">
      <div class="popover-divider" />
      <label class="popover-row zoom-sync">Sync zoom across frames<HstSwitch layout="inline" :model-value="settings.state.syncZoom" @update:model-value="settings.update({ syncZoom: $event })" /></label>
    </template>
  </ToolbarPopover>
</template>

<style scoped>
.zoom-label { color: var(--histoire-text); font-family: var(--histoire-font-mono); font-size: 11px; min-width: 29px; }
.zoom-sync { cursor: default !important; }
</style>
