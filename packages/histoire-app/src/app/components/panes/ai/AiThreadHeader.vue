<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Thread title. */
  title: string
}>()
const emit = defineEmits<{
  /** Return to the thread list. */
  back: []
}>()
defineSlots<{
  /** Trailing thread actions. */
  default?: () => any
}>()
</script>

<template>
  <header class="ai-thread-header">
    <HstButton icon-only color="flat" type="button" aria-label="Back to threads" title="Back" @click="emit('back')">
      <BuiltinIcon icon="chevron-left" :size="16" />
    </HstButton>
    <h3 :title="title">
      {{ title }}
    </h3>
    <slot />
  </header>
</template>

<style scoped>
.ai-thread-header { display: flex; flex: none; align-items: center; gap: 4px; padding: 0 var(--histoire-pane-gutter) var(--histoire-pane-row-inset); border-bottom: 1px solid var(--histoire-border); }
.ai-thread-header h3 { flex: 1; min-width: 0; margin: 0; overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.ai-thread-header :deep(button) { color: var(--histoire-muted); }
</style>
