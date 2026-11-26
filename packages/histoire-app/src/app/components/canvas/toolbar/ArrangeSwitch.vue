<script setup lang="ts">
import type { CanvasArrangement } from '../../../stores/canvas-arrangement.js'
import { useContributionLookup } from '../../../composables/shell-extensions.js'
import { resolveContributionIcon } from '../../../extensions/icons.js'
import { useToolbarPresentation } from '../../base/overflow/presentation.js'
import ToolbarButton from './ToolbarButton.vue'

/** Arrangement is route-controlled by standalone adapter. */
defineProps<{ arrange: CanvasArrangement }>()
const emit = defineEmits<{ arrange: [value: CanvasArrangement] }>()
// Plugin views follow the built-ins in registry order; reads re-run on registry changes.
const views = useContributionLookup('canvas.view')

const presentation = useToolbarPresentation()
</script>

<template>
  <div :data-presentation="presentation" class="histoire-button-group-options htw:data-[presentation=menu]:flex-col htw:data-[presentation=menu]:items-stretch htw:data-[presentation=menu]:gap-px htw:data-[presentation=menu]:p-0 htw:data-[presentation=menu]:bg-transparent" role="group" aria-label="Arrange frames">
    <ToolbarButton menu-role="menuitemradio" label="Single variant" icon="document" :pressed="arrange === 'single'" @click="emit('arrange', 'single')" />
    <ToolbarButton menu-role="menuitemradio" label="Grid" icon="grid" :pressed="arrange === 'grid'" @click="emit('arrange', 'grid')" />
    <ToolbarButton menu-role="menuitemradio" label="List" icon="list-boxes" :pressed="arrange === 'list'" @click="emit('arrange', 'list')" />
    <ToolbarButton menu-role="menuitemradio" label="Props matrix" icon="data-table" :pressed="arrange === 'matrix'" @click="emit('arrange', 'matrix')" />
    <ToolbarButton v-for="view in views.list()" :key="view.id" menu-role="menuitemradio" :label="view.label" :icon="resolveContributionIcon(view)" :pressed="arrange === view.id" @click="emit('arrange', view.id as CanvasArrangement)" />
  </div>
</template>
