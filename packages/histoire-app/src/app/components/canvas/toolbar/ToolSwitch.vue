<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import { useToolbarPresentation } from '../../base/overflow/presentation.js'
import { getActiveCanvasTool } from '../active-tool.js'
import { canMeasureFrame } from '../measure-owner.js'
import { injectCanvasPluginTools } from '../tools/plugin-tools.js'
import ToolbarButton from './ToolbarButton.vue'

defineProps<{
  /** Consume duplicate toolbar inset when this is the first inline group. */
  leading?: boolean
}>()

const canvas = useCanvasStore()
const frames = useCanvasFrames()
const shortcuts = useShortcutRegistry()
/** Registry-backed plugin tools of the owning viewport, after built-in tools. */
const pluginTools = injectCanvasPluginTools()
/** Single view scrolls bounded content instead of panning a free camera. */
const panAvailable = computed(() => canvas.arrangement !== 'single')
const activeTool = computed(() => getActiveCanvasTool(canvas))
const measureAvailable = computed(() => canMeasureFrame(canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null))

const presentation = useToolbarPresentation()
</script>

<template>
  <div :data-presentation="presentation" :data-leading="leading" class="histoire-button-group-options htw:data-[presentation=menu]:flex-col htw:data-[presentation=menu]:items-stretch htw:data-[presentation=menu]:gap-px htw:data-[presentation=menu]:p-0 htw:data-[presentation=menu]:bg-transparent htw:data-[presentation=inline]:data-[leading=true]:-ms-[3px]" role="group" aria-label="Canvas tool">
    <ToolbarButton menu-role="menuitemradio" label="Select" icon="cursor-1" :shortcut="shortcuts?.hint('canvas.select')" :pressed="activeTool === 'select'" @click="canvas.setTool('select')" />
    <ToolbarButton menu-role="menuitemradio" label="Pan" icon="move" :shortcut="shortcuts?.hint('canvas.pan')" :pressed="activeTool === 'pan'" :disabled="!panAvailable" :description="panAvailable ? undefined : 'Pan isn’t available in single variant view'" @click="canvas.setTool('pan')" />
    <ToolbarButton menu-role="menuitemradio" label="Measure" icon="ruler" :shortcut="shortcuts?.hint('canvas.measure')" :pressed="activeTool === 'measure'" :disabled="!measureAvailable" :description="measureAvailable ? undefined : 'Measurement isn’t available for this story'" @click="canvas.setTool('measure')" />
    <ToolbarButton v-for="tool in pluginTools?.tools.value" :key="tool.id" menu-role="menuitemradio" :label="tool.label" :icon="tool.icon" :shortcut="tool.shortcut?.length ? shortcuts?.hint(tool.id) : undefined" :pressed="activeTool === tool.id" @click="pluginTools?.activate(tool)" />
    <!-- Optional extra tools (dev comment tool) supplied by the shell. -->
    <slot />
  </div>
</template>
