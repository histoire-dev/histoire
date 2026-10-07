<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import './workbench-state.css'

defineProps<{
  /** Offline Carbon glyph name shown in accent badge. */
  icon: string
  /** Short headline describing why area is empty. */
  title: string
}>()
defineSlots<{
  /** Optional muted detail line under title. */
  default?: () => any
  /** Optional follow-up actions, such as widening a filter. */
  actions?: () => any
}>()
</script>

<template>
  <div class="workbench-state workbench-empty-state" role="status">
    <span class="workbench-state-visual workbench-empty-state-icon">
      <BuiltinIcon :icon="icon" :size="22" />
    </span>
    <strong>{{ title }}</strong>
    <p v-if="$slots.default">
      <slot />
    </p>
    <div v-if="$slots.actions" class="workbench-empty-state-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.workbench-empty-state-icon { border-radius: 50%; background: var(--histoire-accent-soft); }
.workbench-empty-state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.workbench-empty-state-actions :deep(.histoire-button[data-color="flat"]) { color: var(--histoire-accent); }
</style>
