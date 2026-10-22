<script setup lang="ts">
import { HstButtonGroup } from '@histoire/controls/vue'
import WorkbenchPaneToolbar from '../../shell/WorkbenchPaneToolbar.vue'
/** Current project-result scope; emitted value remains caller-owned. */
defineProps<{ modelValue: 'failing' | 'all' | 'changed' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'failing' | 'all' | 'changed'] }>()
/** Exact filter values shared with existing result model. */
const filters = [{ value: 'failing', label: 'Failing' }, { value: 'all', label: 'All' }, { value: 'changed', label: 'Changed' }]
</script>

<template>
  <WorkbenchPaneToolbar>
    <HstButtonGroup layout="inline" aria-label="Filter tests" :model-value="modelValue" :options="filters" @update:model-value="emit('update:modelValue', $event)" />
  </WorkbenchPaneToolbar>
</template>
