<script setup lang="ts">
import ToolbarButton from './ToolbarButton.vue'

/** Arrangement is route-controlled by standalone adapter. */
defineProps<{ arrange: 'single' | 'grid' | 'list' | 'matrix' }>()
const emit = defineEmits<{ arrange: [value: 'single' | 'grid' | 'list' | 'matrix'] }>()
</script>

<template>
  <div class="histoire-arrange-switch histoire-button-group-options" role="group" aria-label="Arrange frames">
    <ToolbarButton menu-role="menuitemradio" label="Single variant" icon="document" :pressed="arrange === 'single'" @click="emit('arrange', 'single')" />
    <ToolbarButton menu-role="menuitemradio" label="Grid" icon="grid" :pressed="arrange === 'grid'" @click="emit('arrange', 'grid')" />
    <ToolbarButton menu-role="menuitemradio" label="List" icon="list-boxes" :pressed="arrange === 'list'" @click="emit('arrange', 'list')" />
    <ToolbarButton menu-role="menuitemradio" label="Props matrix" icon="data-table" :pressed="arrange === 'matrix'" @click="emit('arrange', 'matrix')" />
  </div>
</template>
