<script setup lang="ts">
import type { SearchScope } from './query.js'
import { HstButtonGroup } from '@histoire/controls/vue'

defineProps<{
  /** Current result scope. */
  modelValue: SearchScope
}>()
const emit = defineEmits<{
  /** Change only local result visibility. */
  'update:modelValue': [value: SearchScope]
}>()
/** Parallel search scope labels. */
const scopes: { value: SearchScope, label: string }[] = [{ value: 'all', label: 'All' }, { value: 'stories', label: 'Stories' }, { value: 'docs', label: 'Docs' }, { value: 'props', label: 'Props' }]
</script>

<template>
  <div class="search-scopes">
    <HstButtonGroup layout="inline" aria-label="Search scope" :model-value="modelValue" :options="scopes" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>

<style scoped>
.search-scopes { display: flex; margin-bottom: 12px; }
.search-scopes :deep(.histoire-button-group) { width: 100%; max-width: 100%; }
.search-scopes :deep(.histoire-control-content), .search-scopes :deep(.histoire-control-value), .search-scopes :deep(.histoire-button-group-options) { width: 100%; max-width: 100%; }
</style>
