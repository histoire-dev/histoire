<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'

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
  <div class="workbench-empty-state" role="status">
    <span class="workbench-empty-state-icon">
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
.workbench-empty-state { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 48px 16px; text-align: center; color: var(--histoire-muted); font-size: 12px; }
.workbench-empty-state-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 8px; border-radius: 50%; background: var(--histoire-accent-soft); color: var(--histoire-accent); }
.workbench-empty-state strong { color: var(--histoire-text); font-size: 14px; font-weight: 600; }
.workbench-empty-state p { max-width: 100%; margin: 0; overflow-wrap: anywhere; }
.workbench-empty-state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.workbench-empty-state-actions :deep(.histoire-button[data-color="flat"]) { color: var(--histoire-accent); }
</style>
