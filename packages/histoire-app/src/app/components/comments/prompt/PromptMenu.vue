<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import AgentLogo from '../../agents/AgentLogo.vue'
import BasePopover from '../../base/popover/BasePopover.vue'
import MenuItem from '../../menu/MenuItem.vue'

/** One prompt menu row. */
export interface PromptMenuItem {
  /** Value emitted on pick. */
  id: string
  /** Visible text. */
  label: string
  /** Offline glyph name. */
  icon?: string
  /** Agent row: registry logo URL, or bundled bot glyph when empty. */
  logo?: { icon?: string }
  /** Current choice of a radio menu. */
  checked?: boolean
}

defineProps<{
  /** Trigger owning menu focus and position. */
  anchor: HTMLElement | null
  /** Accessible menu name. */
  label: string
  /** Rows. */
  items: readonly PromptMenuItem[]
  /** Rows are exclusive choices (`menuitemradio`). */
  radio?: boolean
  /** Agent-colored icons. */
  ai?: boolean
}>()
const emit = defineEmits<{
  /** Row picked. */
  pick: [id: string]
  /** Menu dismissed without a pick. */
  close: []
}>()
// Mounted only while open so closed triggers need no workbench context.
const context = useHistoireContext()
</script>

<template>
  <BasePopover open :anchor="anchor" :label="label" role="menu" :width="220" :overlay-target="context.overlay.value ?? context.root.value" @update:open="emit('close')">
    <MenuItem v-for="item in items" :key="item.id" :label="item.label" :icon="item.icon" :ai="ai" :role="radio ? 'menuitemradio' : 'menuitem'" :aria-checked="radio ? Boolean(item.checked) : undefined" @click="emit('pick', item.id)">
      <AgentLogo v-if="item.logo" class="prompt-menu-logo" :icon="item.logo.icon" :size="16" />
      <BuiltinIcon v-if="item.checked" class="prompt-menu-check" icon="checkmark" :size="16" />
    </MenuItem>
  </BasePopover>
</template>

<style scoped>
.prompt-menu-logo { order: -1; color: var(--histoire-agent); }
.prompt-menu-check { margin-left: auto; }
</style>
