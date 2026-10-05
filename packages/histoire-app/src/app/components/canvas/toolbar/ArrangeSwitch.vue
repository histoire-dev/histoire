<script setup lang="ts">
import ToolbarButton from './ToolbarButton.vue'

/** Arrangement is route-controlled by standalone adapter. */
defineProps<{ arrange: 'grid' | 'list' | 'matrix', matrixAvailable?: boolean }>()
const emit = defineEmits<{ arrange: [value: 'grid' | 'list' | 'matrix'] }>()
</script>

<template>
  <div class="histoire-arrange-switch histoire-button-group-options" role="group" aria-label="Arrange frames">
    <ToolbarButton menu-role="menuitemradio" label="Grid" icon="grid" :pressed="arrange === 'grid'" @click="emit('arrange', 'grid')" />
    <ToolbarButton menu-role="menuitemradio" label="List" icon="list-boxes" :pressed="arrange === 'list'" @click="emit('arrange', 'list')" />
    <ToolbarButton menu-role="menuitemradio" label="Props matrix" icon="data-table" :pressed="arrange === 'matrix'" :disabled="!matrixAvailable" @click="emit('arrange', 'matrix')" />
  </div>
</template>
