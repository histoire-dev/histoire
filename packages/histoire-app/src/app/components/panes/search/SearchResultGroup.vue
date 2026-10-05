<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchSearchResult } from './query.js'
import { computed, ref, watch } from 'vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import SearchResultItem from './SearchResultItem.vue'

const props = defineProps<{
  /** Ordered nonempty result groups share one viewport, including their headings. */
  groups: readonly { title: string, results: readonly WorkbenchSearchResult[] }[]
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
/** Heading and search result retain separate recycling pools and stable identities. */
type SearchEntry = { key: string, kind: 'heading', title: string } | { key: string, kind: 'result', result: WorkbenchSearchResult }
const rows = computed<SearchEntry[]>(() => props.groups.flatMap(group => group.results.length
  ? [
      { key: JSON.stringify(['heading', group.title]), kind: 'heading' as const, title: group.title },
      ...group.results.map(result => ({ key: result.id, kind: 'result' as const, result })),
    ]
  : []))
const list = ref<{ reveal: (key: string) => Promise<void> }>()
watch(() => props.activeId, key => key && void list.value?.reveal(key), { flush: 'post' })
</script>

<template>
  <WorkbenchVirtualList ref="list" class="result-groups" :items="rows" :min-item-size="40" page-mode list-tag="ul" item-tag="li" aria-label="Search results">
    <template #default="{ item }">
      <h3 v-if="item.kind === 'heading'">
        {{ item.title }}
      </h3>
      <SearchResultItem v-else :result="item.result" :query="query" :active="item.result.id === activeId" :selected="selection?.storyId === item.result.target.storyId && selection?.variantId === item.result.target.variantId" @activate="emit('activate', item.result, $event)" @focus="emit('focus', item.result.id)" />
    </template>
  </WorkbenchVirtualList>
</template>

<style scoped>
h3 { padding: 22px 10px 5px; margin: 0; color: var(--histoire-muted); font-size: 12px; font-weight: 600; }
</style>
