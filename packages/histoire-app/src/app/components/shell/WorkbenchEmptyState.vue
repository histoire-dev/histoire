<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import WorkbenchStateLayout from './WorkbenchStateLayout.vue'

defineProps<{
  /** Offline Carbon glyph name shown in the badge. */
  icon: string
  /** Badge color: `accent` (default) or `neutral` for areas that are empty by default. */
  tone?: 'accent' | 'neutral'
  /** Short headline describing why area is empty. */
  title: string
  /** Grow to fill available flex-panel space. */
  fill?: boolean
  /** Leave outer spacing to the parent layout. */
  flush?: boolean
}>()
defineSlots<{
  /** Optional muted detail line under title. */
  default?: () => any
  /** Optional follow-up actions, such as widening a filter. */
  actions?: () => any
}>()
</script>

<template>
  <WorkbenchStateLayout :title="title" :fill="fill" :flush="flush" role="status">
    <template #visual>
      <span class="htw:grid htw:place-items-center htw:flex-none htw:size-12 htw:mb-2 htw:rounded-full" :class="tone === 'neutral' ? 'htw:text-muted htw:bg-chip' : 'htw:text-accent htw:bg-accent-soft'">
        <BuiltinIcon :icon="icon" :size="22" />
      </span>
    </template>
    <template v-if="$slots.default" #default>
      <slot />
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </WorkbenchStateLayout>
</template>
