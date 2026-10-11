<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import './workbench-state.css'

withDefaults(defineProps<{
  /** Offline Carbon glyph name shown in danger badge. */
  icon?: string
  /** Short headline describing operation that failed. */
  title: string
}>(), { icon: 'error-filled' })
defineSlots<{
  /** Optional error detail beneath headline. */
  default?: () => any
  /** Optional recovery actions, such as retrying operation. */
  actions?: () => any
}>()
</script>

<template>
  <div class="workbench-state workbench-error-state" role="alert" aria-atomic="true">
    <span class="workbench-state-visual workbench-error-state-icon" aria-hidden="true">
      <BuiltinIcon :icon="icon" :size="22" />
    </span>
    <strong>{{ title }}</strong>
    <p v-if="$slots.default">
      <slot />
    </p>
    <div v-if="$slots.actions" class="workbench-state-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.workbench-error-state-icon { border-radius: 50%; color: var(--histoire-danger-text); background: var(--histoire-danger-soft); }
.workbench-state-actions :deep(.histoire-button[data-color="flat"]) { color: var(--histoire-danger-text); }
</style>
