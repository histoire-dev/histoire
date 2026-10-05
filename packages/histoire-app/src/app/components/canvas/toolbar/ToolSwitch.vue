<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import { canMeasureFrame } from '../measure-owner.js'
import ToolbarButton from './ToolbarButton.vue'

const canvas = useCanvasStore()
const frames = useCanvasFrames()
const shortcuts = useShortcutRegistry()
const measureAvailable = computed(() => canMeasureFrame(canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null))
</script>

<template>
  <div class="histoire-tool-switch histoire-button-group-options" role="group" aria-label="Canvas tool">
    <ToolbarButton menu-role="menuitemradio" label="Select" icon="cursor-1" :shortcut="shortcuts?.hint('canvas.select')" :pressed="canvas.tool === 'select'" @click="canvas.setTool('select')" />
    <ToolbarButton menu-role="menuitemradio" label="Pan" icon="move" :shortcut="shortcuts?.hint('canvas.pan')" :pressed="canvas.tool === 'pan'" @click="canvas.setTool('pan')" />
    <ToolbarButton menu-role="menuitemradio" label="Measure" icon="ruler" :shortcut="shortcuts?.hint('canvas.measure')" :pressed="canvas.tool === 'measure'" :disabled="!measureAvailable" :description="measureAvailable ? undefined : 'Measure requires a mounted same-origin frame'" @click="canvas.setTool('measure')" />
  </div>
</template>
