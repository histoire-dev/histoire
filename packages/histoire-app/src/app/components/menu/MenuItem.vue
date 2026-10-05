<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

/** Menu rows share layout and native disabled semantics across root and submenu. */
defineProps<{ label: string, icon?: string, shortcut?: string, disabled?: string, submenu?: boolean, ai?: boolean }>()
</script>

<template>
  <HstButton color="flat" type="button" role="menuitem" tabindex="-1" class="histoire-menu-item" :class="{ ai }" :disabled="Boolean(disabled)" :aria-disabled="Boolean(disabled)" :title="disabled" :aria-haspopup="submenu ? 'menu' : undefined">
    <WorkbenchIcon v-if="icon" :name="icon" /><span>{{ label }}</span><span v-if="shortcut" class="menu-shortcut">{{ shortcut }}</span><WorkbenchIcon v-if="submenu" class="submenu-chevron" name="chevron-right" :size="12" /><slot />
  </HstButton>
</template>

<style scoped>
.histoire-menu-item { display: flex; width: 100%; min-height: 31px; align-items: center; gap: 10px; padding: 6px 9px; color: var(--histoire-body); text-align: left; }
.histoire-menu-item :deep(svg) { display: block; flex: none; color: var(--histoire-muted); }
.histoire-menu-item.ai :deep(svg) { color: var(--histoire-agent); }
.menu-shortcut, .submenu-chevron { margin-left: auto; color: var(--histoire-muted); }
.menu-shortcut { font: 10px var(--histoire-font-mono); }
</style>
