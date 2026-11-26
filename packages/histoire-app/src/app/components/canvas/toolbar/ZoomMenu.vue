<script setup lang="ts">
import { HstSwitch } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useUiSettingsStore } from '../../../stores/settings.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import PopoverDivider from '../../base/popover/PopoverDivider.vue'
import PopoverMeta from '../../base/popover/PopoverMeta.vue'
import PopoverRow from '../../base/popover/PopoverRow.vue'
import ToolbarPopover from './ToolbarPopover.vue'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const selectedFrame = computed(() => canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null)
const settings = useUiSettingsStore()
const shortcuts = useShortcutRegistry()
const label = computed(() => canvas.zoom === 'selection' ? 'Selection' : canvas.zoom === 'fit' ? 'Fit' : `${Math.round(canvas.zoom * 100)}%`)

/** Zoom ownership respects optional per-story synchronization preference. */
function zoom(value: number | 'fit') {
  canvas.setZoom(value)
  emit('update:open', null)
}

/** Selection zoom uses canvas geometry rather than preview document scaling. */
function selection() {
  const frame = selectedFrame.value
  if (frame) canvas.zoomToSelection(frame.fitBounds ?? frame.rect)
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="zoom" :open="open" label="Zoom level" :width="240" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="htw:text-text htw:font-mono htw:text-[11px] htw:min-w-[29px]">{{ label }}</span>
    </template>
    <div class="htw:menu-rows">
      <PopoverRow :aria-pressed="canvas.zoom === 'fit'" @click="zoom('fit')">
        Fit to canvas<PopoverMeta>{{ shortcuts?.hint('canvas.fit') || '⇧1' }}</PopoverMeta>
      </PopoverRow>
      <PopoverRow v-if="canvas.arrangement !== 'single'" :disabled="!selectedFrame" :aria-pressed="canvas.zoom === 'selection'" @click="selection">
        Zoom to selection<PopoverMeta>{{ shortcuts?.hint('canvas.selection') || '⇧2' }}</PopoverMeta>
      </PopoverRow>
      <PopoverRow v-for="value in [.25, .5, 1, 2]" :key="value" :aria-pressed="canvas.zoom === value" @click="zoom(value)">
        {{ value * 100 }}%<PopoverMeta v-if="value === 1">
          {{ shortcuts?.hint('canvas.actual') || '⇧0' }}
        </PopoverMeta>
      </PopoverRow>
    </div>
    <template v-if="settings">
      <PopoverDivider />
      <PopoverRow class="htw:cursor-default" as="label">
        Sync zoom across stories<HstSwitch class="htw:ms-auto" layout="inline" :model-value="settings.state.syncZoom" @update:model-value="settings.update({ syncZoom: $event })" />
      </PopoverRow>
    </template>
  </ToolbarPopover>
</template>
