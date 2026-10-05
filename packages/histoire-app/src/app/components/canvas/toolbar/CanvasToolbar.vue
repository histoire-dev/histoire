<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useContextMenu } from '../../../composables/context-menu.js'
import { registerFrameShortcuts, useFrameActions } from '../../../util/frame-actions.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import BaseOverflowToolbar from '../../base/overflow/BaseOverflowToolbar.vue'
import BaseOverflowToolbarItem from '../../base/overflow/BaseOverflowToolbarItem.vue'
import { getRegisteredFrameTarget } from '../frame-target.js'
import ArrangeSwitch from './ArrangeSwitch.vue'
import BackgroundPicker from './BackgroundPicker.vue'
import { useCanvasPopoverBounds } from './bounds.js'
import SearchMatchStepper from './SearchMatchStepper.vue'
import { useCanvasPreviewSettings } from './session-settings.js'
import { registerCanvasShortcuts } from './shortcuts.js'
import ToolbarButton from './ToolbarButton.vue'
import ToolSwitch from './ToolSwitch.vue'
import ViewportMenu from './ViewportMenu.vue'
import ZoomMenu from './ZoomMenu.vue'

/** Optional tools arrive through named slots without coupling toolbar to dev services. */
defineProps<{
  /** Active arrangement from standalone route/preferences. */
  arrange: 'grid' | 'list' | 'matrix'
  /** Collected runtime supports exact matrix cells. */
  matrixAvailable?: boolean
  /** Matching current-story frame count. */
  matchCount?: number
  /** Independent reveal cursor position. */
  matchPosition?: number
}>()
const emit = defineEmits<{ arrange: [value: 'grid' | 'list' | 'matrix'], editPresets: [], previousMatch: [], nextMatch: [] }>()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const { snapshot, update } = useCanvasPreviewSettings()
const shortcuts = useShortcutRegistry()
const actions = useFrameActions()
const menu = useContextMenu()
const open = ref<string | null>(null)
const toolbar = shallowRef<InstanceType<typeof BaseOverflowToolbar> | null>(null)
const { bounds, overlayTarget } = useCanvasPopoverBounds(() => toolbar.value?.$el)
const disposers: (() => void)[] = []

/** Extension slots share same open identity as viewport, zoom and background. */
function setOpen(value: string | null) {
  open.value = value
}

if (shortcuts) {
  disposers.push(registerCanvasShortcuts(shortcuts, canvas, frames))
  if (actions) {
    disposers.push(registerFrameShortcuts(shortcuts, actions, (event) => {
      if (menu?.state.target) return menu.state.target
      const focused = event ? getRegisteredFrameTarget(event.target, frames) : null
      if (focused) return focused
      const frame = canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null
      return frame ? { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id } : null
    }))
  }
}
onBeforeUnmount(() => disposers.forEach(dispose => dispose()))
</script>

<template>
  <BaseOverflowToolbar ref="toolbar" class="histoire-canvas-toolbar" label="Canvas tools" overflow-label="More canvas tools" :overlay-target="overlayTarget" :bounds="bounds" @update:open="value => { if (!value) setOpen(null) }" @wheel.stop @pointerdown.stop>
    <BaseOverflowToolbarItem v-if="matchCount" id="search">
      <SearchMatchStepper :count="matchCount" :position="matchPosition ?? 0" @previous="emit('previousMatch')" @next="emit('nextMatch')" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="tools" :separator-before="Boolean(matchCount)">
      <ToolSwitch />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="arrange" separator-before>
      <ArrangeSwitch :arrange="arrange" :matrix-available="matrixAvailable" @arrange="emit('arrange', $event)" /><slot name="matrix" v-bind="{ open, setOpen }" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="viewport" separator-before>
      <ViewportMenu v-model:open="open" @edit-presets="emit('editPresets')" />
      <ToolbarButton label="Rotate viewport" icon="rotate" :pressed="snapshot.settings.rotate" @click="update({ rotate: !snapshot.settings.rotate })" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="zoom" separator-before>
      <ToolbarButton label="Zoom out" icon="zoom-out" @click="canvas.setZoom(canvas.effectiveZoom / 1.25)" />
      <ZoomMenu v-model:open="open" />
      <ToolbarButton label="Zoom in" icon="zoom-in" @click="canvas.setZoom(canvas.effectiveZoom * 1.25)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="background" separator-before>
      <BackgroundPicker v-model:open="open" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="screenshot">
      <slot name="screenshot" v-bind="{ open, setOpen }" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="comment">
      <slot name="comment" v-bind="{ open, setOpen }" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="inspector">
      <slot name="inspector" />
    </BaseOverflowToolbarItem>
  </BaseOverflowToolbar>
</template>

<style scoped>
.histoire-canvas-toolbar { height: 36px; padding: 3px; border: 1px solid var(--histoire-border); border-radius: 12px; background: var(--histoire-surface); box-shadow: 0 2px 5px rgb(0 0 0 / .07); pointer-events: auto; }
</style>
