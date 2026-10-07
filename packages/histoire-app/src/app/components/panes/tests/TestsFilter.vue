<script setup lang="ts">
import { HstButtonGroup } from '@histoire/controls/vue'
/** Current project-result scope; emitted value remains caller-owned. */
defineProps<{ modelValue: 'failing' | 'all' | 'changed' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'failing' | 'all' | 'changed'] }>()
/** Exact filter values shared with existing result model. */
const filters = [{ value: 'failing', label: 'Failing' }, { value: 'all', label: 'All' }, { value: 'changed', label: 'Changed' }]
</script>

<template>
  <div class="test-filters">
    <HstButtonGroup layout="inline" aria-label="Filter tests" :model-value="modelValue" :options="filters" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>

<style scoped>
.test-filters { display: flex; flex: none; padding: 12px var(--histoire-pane-gutter, 16px); }
.test-filters :deep(.histoire-button-group) { width: 100%; }
</style>
