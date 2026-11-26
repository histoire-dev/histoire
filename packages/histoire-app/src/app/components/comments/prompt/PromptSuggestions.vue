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
  <ul :id="id" class="htw:absolute htw:[z-index:2] htw:[right:-1px] htw:[bottom:calc(100%_+_4px)] htw:[left:-1px] htw:max-h-55 htw:m-0 htw:p-1 htw:overflow-y-auto htw:list-none htw:border htw:border-border htw:rounded-control htw:bg-surface htw:shadow-panel htw:menu-rows" role="listbox" :aria-label="label" @mousedown.prevent>
    <li v-for="(item, index) in items" :id="`${id}-${index}`" :key="item.id" role="option" :aria-selected="index === active" class="htw:flex htw:items-center htw:gap-2 htw:min-w-0 htw:py-1.25 htw:px-2 htw:rounded-control htw:text-body htw:text-[12px] htw:cursor-pointer htw:aria-selected:bg-chip" @click="emit('pick', index)">
      <BuiltinIcon :icon="item.icon" :size="14" class="htw:flex-none htw:text-muted" /><span class="htw:flex-none htw:font-mono">{{ item.label }}</span><span v-if="item.detail" class="htw:min-w-0 htw:overflow-hidden htw:text-muted htw:text-ellipsis htw:whitespace-nowrap">{{ item.detail }}</span>
    </li>
    <li v-if="!items.length" class="empty htw:flex htw:items-center htw:gap-2 htw:min-w-0 htw:py-1.25 htw:px-2 htw:rounded-control htw:text-[12px] htw:text-muted htw:cursor-default htw:aria-selected:bg-chip" role="presentation">
      {{ empty }}
    </li>
  </ul>
</template>
