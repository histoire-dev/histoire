<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Visible context name, e.g. a story and variant. */
  label: string
  /** Offline glyph name. */
  icon?: string
  /** Tooltip. */
  title?: string
  /** Shows a remove button. */
  removable?: boolean
}>()
const emit = defineEmits<{
  /** Stop sending this context. */
  remove: []
}>()
</script>

<template>
  <span class="context-chip" :title="title ?? label">
    <BuiltinIcon :icon="icon ?? 'catalog'" :size="12" />
    <span class="context-label">{{ label }}</span>
    <HstButton v-if="removable" icon-only color="flat" type="button" class="context-remove" :aria-label="`Remove ${label}`" :title="`Remove ${label}`" @click="emit('remove')">
      <BuiltinIcon icon="close" :size="12" />
    </HstButton>
  </span>
</template>

<style scoped>
.context-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 24px; padding: 0 2px 0 8px; border-radius: 999px; background: var(--histoire-chip); color: var(--histoire-body); font-size: 12px; }
.context-chip > :first-child { flex: none; color: var(--histoire-muted); }
.context-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.context-remove { --histoire-icon-button-size: 20px; flex: none; border-radius: 999px; color: var(--histoire-muted); }
</style>
