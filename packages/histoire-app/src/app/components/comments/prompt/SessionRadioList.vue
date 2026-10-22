<script setup lang="ts">
import type { UiAgentConfigSelector } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Group name, e.g. "Model". */
  label: string
  /** Agent-advertised choices. */
  selector: UiAgentConfigSelector
  /** Value in effect. */
  current?: string
  /** Disables every choice. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Picked value. */
  pick: [value: string]
}>()
</script>

<template>
  <div class="session-group">
    <span class="session-heading">{{ label }}</span>
    <div role="radiogroup" :aria-label="label" class="session-list">
      <HstButton v-for="option in selector.options" :key="option.value" color="flat" type="button" role="radio" :aria-label="option.label" :aria-checked="option.value === current" :disabled="disabled" @click="emit('pick', option.value)">
        <span>{{ option.group ? `${option.group} / ${option.label}` : option.label }}</span><BuiltinIcon v-if="option.value === current" icon="checkmark" :size="14" />
      </HstButton>
    </div>
  </div>
</template>

<style scoped>
.session-group { display: flex; flex-direction: column; gap: 4px; }
.session-heading { color: var(--histoire-muted); font-size: 11px; font-weight: 600; }
.session-list { display: flex; flex-direction: column; max-height: 176px; overflow-y: auto; }
.session-list :deep(button) { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 8px; color: var(--histoire-body); font-size: 12px; text-align: left; }
.session-list :deep(button[aria-checked="true"]) { color: var(--histoire-text); font-weight: 600; }
</style>
