<script setup lang="ts">
import type { WorkbenchSearchResult } from './query.js'
import { HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import { getSearchResultDomId } from './accessibility.js'

const props = defineProps<{
  /** Exact result owned by current query publication. */
  result: WorkbenchSearchResult
  /** Query used only for plain-text match emphasis. */
  query: string
  /** Keyboard-highlighted row. */
  active: boolean
  /** Session-selected target. */
  selected: boolean
}>()
const emit = defineEmits<{
  /** Activate this exact row with optional isolated preview intent. */
  activate: [isolated: boolean]
  /** Synchronize keyboard highlight on native row focus. */
  focus: []
}>()
/** Variant context names its story without duplicating folder path text. */
const title = computed(() => props.result.kind === 'variant' && props.result.path.length ? `${props.result.path.at(-1)} › ${props.result.title}` : props.result.title)
/** Literal text ranges never render index excerpts as HTML. */
const pieces = computed(() => {
  const text = title.value
  const query = props.query.trim().toLocaleLowerCase()
  const index = query ? text.toLocaleLowerCase().indexOf(query) : -1
  return index < 0 ? [{ text, matched: false }] : [{ text: text.slice(0, index), matched: false }, { text: text.slice(index, index + query.length), matched: true }, { text: text.slice(index + query.length), matched: false }]
})
/** Compact contextual second line mirrors the result boards. */
const detail = computed(() => props.result.excerpt || props.result.path.slice(0, props.result.kind === 'variant' ? -1 : undefined).join(' › '))
</script>

<template>
  <HstButton :id="getSearchResultDomId(result.id)" color="flat" type="button" class="search-result" :class="{ active }" data-test-id="search-item" :data-search-kind="result.kind" :aria-current="selected ? 'true' : undefined" @focus="emit('focus')" @click="emit('activate', $event.metaKey || $event.ctrlKey)">
    <WorkbenchIcon :name="result.kind === 'docs' ? 'document' : result.kind === 'prop' ? 'settings-adjust' : 'cube'" class="result-icon" :style="{ color: result.iconColor }" />
    <span class="result-copy">
      <strong><template v-for="(piece, index) in pieces" :key="index"><mark v-if="piece.matched">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></strong>
      <small v-if="detail">{{ detail }}</small>
    </span>
  </HstButton>
</template>

<style scoped>
.search-result { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: var(--histoire-list-row-padding, 10px) 10px; text-align: left; color: var(--histoire-text); }
.search-result:hover { background: var(--histoire-chip); }
.search-result.active { background: var(--histoire-accent-soft); }
.search-result:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
.result-icon { width: 18px; height: 18px; flex: none; color: var(--histoire-accent); margin-top: 1px; }
.result-copy { flex: 1; min-width: 0; display: grid; gap: 3px; }
.result-copy strong { font-size: 13px; font-weight: 600; }
.result-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--histoire-muted); font-size: 12px; }
mark { color: inherit; background: transparent; font-weight: 700; }
</style>
