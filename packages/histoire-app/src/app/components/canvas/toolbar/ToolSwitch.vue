<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import { getActiveCanvasTool } from '../active-tool.js'
import { canMeasureFrame } from '../measure-owner.js'
import ToolbarButton from './ToolbarButton.vue'

const canvas = useCanvasStore()
const frames = useCanvasFrames()
const shortcuts = useShortcutRegistry()
/** Single view scrolls bounded content instead of panning a free camera. */
const panAvailable = computed(() => canvas.arrangement !== 'single')
const activeTool = computed(() => getActiveCanvasTool(canvas))
const measureAvailable = computed(() => canMeasureFrame(canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null))
</script>

<template>
  <div class="histoire-tool-switch histoire-button-group-options" role="group" aria-label="Canvas tool">
    <ToolbarButton menu-role="menuitemradio" label="Select" icon="cursor-1" :shortcut="shortcuts?.hint('canvas.select')" :pressed="activeTool === 'select'" @click="canvas.setTool('select')" />
    <ToolbarButton menu-role="menuitemradio" label="Pan" icon="move" :shortcut="shortcuts?.hint('canvas.pan')" :pressed="activeTool === 'pan'" :disabled="!panAvailable" :description="panAvailable ? undefined : 'Pan isn’t available in single variant view'" @click="canvas.setTool('pan')" />
    <ToolbarButton menu-role="menuitemradio" label="Measure" icon="ruler" :shortcut="shortcuts?.hint('canvas.measure')" :pressed="activeTool === 'measure'" :disabled="!measureAvailable" :description="measureAvailable ? undefined : 'Measurement isn’t available for this story'" @click="canvas.setTool('measure')" />
    <!-- Optional extra tools (dev comment tool) supplied by the shell. -->
    <slot />
  </div>
</template>
