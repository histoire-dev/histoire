<script setup lang="ts">
import type { VisualSizing, VisualView } from './viewer-types.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'

defineProps<{
  /** Current image layout. */
  view: VisualView
  /** Shared image scale. */
  zoom: number
  /** Determines whether Fit remains selected. */
  sizing: VisualSizing
  /** Current layer opacity percentage. */
  opacity: number
}>()
const emit = defineEmits<{
  /** Select an available comparison layout. */
  'update:view': [view: VisualView]
  /** Adjust current layer's opacity. */
  'update:opacity': [opacity: number]
  /** Multiply manual zoom, or reset when factor is absent. */
  'zoom': [factor?: number]
  /** Fill measured image pane. */
  'fit': []
}>()
const result = useWorkbenchVisual()!.selectedResult
/** Offline Carbon glyphs for each comparison layout. */
const modes = [
  { value: 'pair', label: 'Side by side', icon: 'side-panel-open' },
  { value: 'diff', label: 'Diff', icon: 'compare' },
  { value: 'overlay', label: 'Overlay', icon: 'copy' },
  { value: 'slider', label: 'Slider', icon: 'arrows-horizontal' },
] as const
/** Layouts requiring absent artifacts cannot be selected. */
function unavailable(mode: VisualView): boolean {
  return mode === 'diff' ? !result.value?.images.diff : mode !== 'pair' && !result.value?.images.baseline
}
/** Native range values enter component state as numbers. */
function changeOpacity(event: Event): void {
  emit('update:opacity', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="viewer-dock viewer-float">
    <div class="modes" role="group" aria-label="Image comparison mode">
      <HstButton v-for="mode in modes" :key="mode.value" color="flat" :icon-only="view !== mode.value" :aria-label="mode.label" :aria-pressed="view === mode.value" :disabled="unavailable(mode.value)" @click="emit('update:view', mode.value)">
        <BuiltinIcon :icon="mode.icon" :size="16" />
        <span v-if="view === mode.value">{{ mode.label }}</span>
      </HstButton>
    </div>
    <span class="divider" aria-hidden="true" />
    <div class="zoom">
      <HstButton color="flat" icon-only aria-label="Zoom out visual images" @click="emit('zoom', 1 / 1.25)">
        <BuiltinIcon icon="subtract" :size="16" />
      </HstButton>
      <code>{{ Math.round(zoom * 100) }}%</code>
      <HstButton color="flat" icon-only aria-label="Zoom in visual images" @click="emit('zoom', 1.25)">
        <BuiltinIcon icon="add" :size="16" />
      </HstButton>
    </div>
    <span class="divider" aria-hidden="true" />
    <div class="sizing">
      <HstButton color="flat" aria-label="Reset visual images to natural size" @click="emit('zoom')">
        Reset
      </HstButton>
      <HstButton color="flat" :aria-pressed="sizing === 'fit'" @click="emit('fit')">
        Fit
      </HstButton>
    </div>
    <label v-if="view === 'overlay'" class="opacity">Opacity <input :value="opacity" type="range" min="0" max="100" aria-label="Overlay opacity" @input="changeOpacity"></label>
  </div>
</template>

<style scoped>
.viewer-dock { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 4px; min-width: 0; max-width: 100%; }
.modes, .zoom, .sizing { display: flex; align-items: center; gap: 2px; }.viewer-dock :deep(button) { min-height: 30px; padding: 4px 9px; font-size: 12px; white-space: nowrap; }.viewer-dock :deep(.histoire-icon-button) { --histoire-icon-button-size: 30px; }
.divider { width: 1px; height: 20px; margin: 0 4px; background: var(--histoire-border); }.zoom code { min-width: 44px; text-align: center; font-size: 12px; }
.opacity { display: flex; align-items: center; gap: 6px; padding: 0 6px; font-size: 11px; color: var(--histoire-muted); }.opacity input { width: 88px; accent-color: var(--histoire-accent); }
@container (max-width: 640px) { .viewer-dock { row-gap: 6px; }.divider { display: none; } }
</style>
