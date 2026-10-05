<script setup lang="ts">
import type { ShellPane } from '../../stores/shell.js'
import { useShell } from '../../composables/shell.js'
import PanelResizeHandle from './PanelResizeHandle.vue'

defineProps<{
  /** Stable region ID referenced by rail accessibility attributes. */
  id: string
  /** Current side-panel identity. */
  pane: ShellPane
}>()
const shell = useShell()
</script>

<template>
  <aside :id="id" class="histoire-side-panel-host" :aria-label="`${pane === 'mcp' ? 'MCP activity' : pane} panel`">
    <slot />
    <PanelResizeHandle :controls="id" label="Resize side panel" edge="end" :model-value="shell.panelWidth.value" :min="shell.panelWidthBounds.value.min" :max="shell.panelWidthBounds.value.max" @update:model-value="shell.setPanelWidth" />
  </aside>
</template>

<style scoped>
.histoire-side-panel-host { display: flex; flex-direction: column; position: relative; min-width: 0; min-height: 0; overflow: hidden; border-inline-end: 1px solid var(--histoire-border); background: var(--histoire-surface); }
@container (max-width: 640px) {
  .histoire-side-panel-host { position: absolute; inset-block: 0 56px; inset-inline-start: 0; width: var(--histoire-panel-width, 280px); max-width: calc(100% - 48px); z-index: 80; border-inline-end: 0; box-shadow: var(--histoire-shadow-panel); }
}
</style>
