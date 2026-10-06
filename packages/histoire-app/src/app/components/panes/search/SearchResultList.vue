<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchSearchResult } from './query.js'
import { computed, ref, watch } from 'vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import SearchResultItem from './SearchResultItem.vue'

const props = defineProps<{
  /** Every result shares one viewport in relevance order, regardless of kind. */
  results: readonly WorkbenchSearchResult[]
  /** Query for match emphasis. */
  query: string
  /** Keyboard-highlighted exact result ID. */
  activeId?: string
  /** Session-selected exact target. */
  selection?: HistoireTarget | null
}>()
const emit = defineEmits<{
  /** Exact result activation intent. */
  activate: [result: WorkbenchSearchResult, isolated: boolean]
  /** Native row focus updates search navigation. */
  focus: [id: string]
}>()
/** Exact result identity survives row recycling and rank changes. */
const rows = computed(() => props.results.map(result => ({ key: result.id, result })))
const list = ref<{ reveal: (key: string) => Promise<void> }>()
watch(() => props.activeId, key => key && void list.value?.reveal(key), { flush: 'post' })
</script>

<template>
  <WorkbenchVirtualList ref="list" :items="rows" :min-item-size="40" page-mode list-tag="ul" item-tag="li" aria-label="Search results">
    <template #default="{ item }">
      <SearchResultItem :result="item.result" :query="query" :active="item.result.id === activeId" :selected="selection?.storyId === item.result.target.storyId && selection?.variantId === item.result.target.variantId" @activate="emit('activate', item.result, $event)" @focus="emit('focus', item.result.id)" />
    </template>
  </WorkbenchVirtualList>
</template>
