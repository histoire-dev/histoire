<script setup lang="ts">
import type { PromptSuggestion } from './suggestions.js'
import { BuiltinIcon } from '@histoire/controls/vue'

defineProps<{
  /** DOM id prefix; the field references rows through `aria-activedescendant`. */
  id: string
  /** Accessible list name. */
  label: string
  /** Rows to offer. */
  items: readonly PromptSuggestion[]
  /** Highlighted row index. */
  active: number
  /** Message shown when there are no rows. */
  empty?: string
}>()
const emit = defineEmits<{
  /** Row picked with the pointer. */
  pick: [index: number]
}>()
</script>

<template>
  <!-- Pointer presses are prevented so focus never leaves the message field. -->
  <ul :id="id" class="prompt-suggestions" role="listbox" :aria-label="label" @mousedown.prevent>
    <li v-for="(item, index) in items" :id="`${id}-${index}`" :key="item.id" role="option" :aria-selected="index === active" :class="{ active: index === active }" @click="emit('pick', index)">
      <BuiltinIcon :icon="item.icon" :size="14" /><span class="suggestion-label">{{ item.label }}</span><span v-if="item.detail" class="suggestion-detail">{{ item.detail }}</span>
    </li>
    <li v-if="!items.length" class="empty" role="presentation">
      {{ empty }}
    </li>
  </ul>
</template>

<style scoped>
.prompt-suggestions { position: absolute; z-index: 2; right: -1px; bottom: calc(100% + 4px); left: -1px; max-height: 220px; margin: 0; padding: 4px; overflow-y: auto; list-style: none; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-control); background: var(--histoire-surface); box-shadow: var(--histoire-shadow-panel); }
.prompt-suggestions li { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 8px; border-radius: var(--histoire-radius-control); color: var(--histoire-body); font-size: 12px; cursor: pointer; }
.prompt-suggestions li.active { background: var(--histoire-chip); }
.prompt-suggestions li.empty { color: var(--histoire-muted); cursor: default; }
.prompt-suggestions li > :first-child { flex: none; color: var(--histoire-muted); }
.suggestion-label { flex: none; font-family: var(--histoire-font-mono); }
.suggestion-detail { min-width: 0; overflow: hidden; color: var(--histoire-muted); text-overflow: ellipsis; white-space: nowrap; }
</style>
