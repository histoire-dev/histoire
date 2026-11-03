<script setup lang="ts">
import type { CanvasArrangement } from '../../../stores/canvas-arrangement.js'
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { isContextMenuShortcut, useContextMenu } from '../../../composables/context-menu.js'
import { usePluginToolbar } from '../../../extensions/toolbar.js'
import { registerFrameShortcuts, useFrameActions } from '../../../util/frame-actions.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import BaseOverflowToolbar from '../../base/overflow/BaseOverflowToolbar.vue'
import BaseOverflowToolbarItem from '../../base/overflow/BaseOverflowToolbarItem.vue'
import { getRegisteredFrameTarget } from '../frame-target.js'
import { useCanvasViewDescriptor } from '../views/canvas-views.js'
import ArrangeSwitch from './ArrangeSwitch.vue'
import BackgroundPicker from './BackgroundPicker.vue'
import { useCanvasPopoverBounds } from './bounds.js'
import PluginToolbarItem from './PluginToolbarItem.vue'
import SearchMatchStepper from './SearchMatchStepper.vue'
import { useCanvasPreviewSettings } from './session-settings.js'
import { registerCanvasShortcuts } from './shortcuts.js'
import ToolbarButton from './ToolbarButton.vue'
import ToolSwitch from './ToolSwitch.vue'
import { useCanvasViewportDimensions } from './viewport-size.js'
import ViewportMenu from './ViewportMenu.vue'
import ZoomMenu from './ZoomMenu.vue'

/** Optional tools arrive through named slots without coupling toolbar to dev services. */
const props = defineProps<{
  /** Active arrangement from standalone route/preferences. */
  arrange: CanvasArrangement
  /** Matching current-story frame count. */
  matchCount?: number
  /** Independent reveal cursor position. */
  matchPosition?: number
}>()
const emit = defineEmits<{ arrange: [value: CanvasArrangement], editPresets: [], previousMatch: [], nextMatch: [], error: [error: unknown] }>()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const { snapshot, update } = useCanvasPreviewSettings()
const viewportDimensions = useCanvasViewportDimensions()
const shortcuts = useShortcutRegistry()
const actions = useFrameActions()
const menu = useContextMenu()
const open = ref<string | null>(null)
const toolbar = shallowRef<InstanceType<typeof BaseOverflowToolbar> | null>(null)
const { bounds, overlayTarget } = useCanvasPopoverBounds(() => toolbar.value?.$el)
const disposers: (() => void)[] = []
// Plugin items follow their named controls; the built-in inspector action stays last.
const plugin = usePluginToolbar()
const pluginItems = plugin.groups
// Custom canvas views declare the groups they support; arrange and inspector always show.
const view = useCanvasViewDescriptor(() => props.arrange)

/** Extension slots share same open identity as viewport, zoom and background. */
function setOpen(value: string | null) {
  open.value = value
}

/** Rotation fixes responsive Single dimensions before swapping orientation. */
function rotateViewport(): void {
  if (canvas.autoFitContent) {
    const size = viewportDimensions.value
    canvas.setSingleViewportMode('fixed')
    canvas.setAutoFitContent(false)
    update({ responsiveWidth: size.width, responsiveHeight: size.height ?? 640, rotate: true })
    return
  }
  if (canvas.arrangement === 'single' && canvas.singleViewport.mode === 'responsive') {
    const size = canvas.singleViewportSize
    canvas.setSingleViewportMode('fixed')
    update({ responsiveWidth: size.width, responsiveHeight: size.height, rotate: true })
  }
  else {
    update({ rotate: !snapshot.value.settings.rotate })
  }
}

/** Toolbar context actions use selected frame identity without changing selection. */
function openSelectedFrameMenu(event: MouseEvent | KeyboardEvent): void {
  if ('key' in event && !isContextMenuShortcut(event)) return
  const frame = canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null
  if (!frame) return
  menu?.open(event, {
    kind: 'toolbar',
    label: `${frame.storyId} › ${frame.variantId}`,
    frame: { storyId: frame.storyId, variantId: frame.variantId, frameKey: frame.id },
  })
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
  <BaseOverflowToolbar ref="toolbar" class="histoire-canvas-toolbar htw:h-[42px] htw:p-1.5 htw:border htw:border-solid htw:border-border htw:rounded-[12px] htw:bg-surface htw:shadow-canvas-toolbar htw:pointer-events-auto" label="Canvas tools" overflow-label="More canvas tools" :overlay-target="overlayTarget" :bounds="bounds" @update:open="value => { if (!value) setOpen(null) }" @contextmenu="openSelectedFrameMenu" @keydown="openSelectedFrameMenu" @wheel.stop @pointerdown.stop>
    <BaseOverflowToolbarItem v-if="(matchCount || pluginItems?.search.length) && view.showsGroup('search')" id="search">
      <SearchMatchStepper v-if="matchCount" :count="matchCount" :position="matchPosition ?? 0" @previous="emit('previousMatch')" @next="emit('nextMatch')" />
      <PluginToolbarItem v-for="item in pluginItems?.search" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('tools')" id="tools" :separator-before="Boolean(matchCount)">
      <ToolSwitch :leading="!matchCount">
        <slot name="tool" />
      </ToolSwitch>
      <PluginToolbarItem v-for="item in pluginItems?.tools" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="arrange" separator-before>
      <ArrangeSwitch :arrange="arrange" @arrange="emit('arrange', $event)" /><slot name="matrix" v-bind="{ open, setOpen }" />
      <PluginToolbarItem v-for="item in pluginItems?.arrange" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('viewport')" id="viewport" separator-before>
      <ViewportMenu v-model:open="open" @edit-presets="emit('editPresets')" />
      <ToolbarButton label="Rotate viewport" icon="rotate" :pressed="!canvas.autoFitContent && snapshot.settings.rotate" @click="rotateViewport" />
      <PluginToolbarItem v-for="item in pluginItems?.viewport" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('zoom')" id="zoom" separator-before>
      <ToolbarButton label="Zoom out" icon="zoom-out" @click="canvas.setZoom(canvas.effectiveZoom / 1.25)" />
      <ZoomMenu v-model:open="open" />
      <ToolbarButton label="Zoom in" icon="zoom-in" @click="canvas.setZoom(canvas.effectiveZoom * 1.25)" />
      <PluginToolbarItem v-for="item in pluginItems?.zoom" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('background')" id="background" separator-before>
      <BackgroundPicker v-model:open="open" />
      <PluginToolbarItem v-for="item in pluginItems?.background" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('screenshot')" id="screenshot">
      <slot name="screenshot" v-bind="{ open, setOpen }" />
      <PluginToolbarItem v-for="item in pluginItems?.screenshot" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('embed')" id="embed">
      <slot name="embed" v-bind="{ open, setOpen }" />
      <PluginToolbarItem v-for="item in pluginItems?.embed" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="inspector">
      <PluginToolbarItem v-for="item in pluginItems?.inspector" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="view.showsGroup('ui')" id="ui" separator-before>
      <slot name="ui" />
      <PluginToolbarItem v-for="item in pluginItems?.ui" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem v-if="pluginItems?.plugins.length && view.showsGroup('plugins')" id="plugins" separator-before>
      <PluginToolbarItem v-for="item in pluginItems?.plugins" :key="plugin.keyOf(item)" :item="item" :workbench="plugin.workbench!" :revision="plugin.revision.value" :open="open" @update:open="setOpen" @error="emit('error', $event)" />
    </BaseOverflowToolbarItem>
    <BaseOverflowToolbarItem id="inspector-toggle" separator-before>
      <slot name="inspector" />
    </BaseOverflowToolbarItem>
  </BaseOverflowToolbar>
</template>
