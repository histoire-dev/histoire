<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { overflowItemKey, overflowToolbarKey } from './context.js'

const props = defineProps<{
  /** Stable identity independent of control label or current position. */
  id: string
  /** Separate this group from preceding group in either presentation. */
  separatorBefore?: boolean
}>()
const toolbar = inject(overflowToolbarKey)
if (!toolbar) throw new Error('BaseOverflowToolbarItem requires BaseOverflowToolbar')
const marker = shallowRef<HTMLElement | null>(null)
const element = shallowRef<HTMLElement | null>(null)
const overflow = ref(false)
const empty = ref(false)
const separator = ref(false)
provide(overflowItemKey, overflow)
let dispose: (() => void) | undefined
onMounted(() => {
  dispose = toolbar.register({ id: props.id, marker, element, overflow, empty, separator, separatorBefore: () => Boolean(props.separatorBefore) })
})
watch(() => props.separatorBefore, toolbar.measure)
onBeforeUnmount(() => dispose?.())
</script>

<template>
  <span ref="marker" class="overflow-toolbar-marker" aria-hidden="true" />
  <Teleport :disabled="!overflow" :to="toolbar.hosts.get(id) ?? 'body'">
    <div ref="element" class="overflow-toolbar-item" :data-toolbar-presentation="overflow ? 'menu' : 'inline'" :data-separator="separator" :hidden="empty">
      <div class="overflow-toolbar-item-content">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overflow-toolbar-marker { display: none; }
.overflow-toolbar-item { display: flex; flex: none; align-items: center; gap: 3px; width: max-content; }
.overflow-toolbar-item[hidden] { display: none; }
.overflow-toolbar-item-content { display: flex; align-items: center; gap: 3px; width: max-content; }
.overflow-toolbar-item[data-separator="true"]::before { content: ""; flex: none; width: 1px; height: 16px; margin-inline: 3px; background: var(--histoire-border); }
.overflow-toolbar-item[data-toolbar-presentation="menu"] { flex-direction: column; align-items: stretch; width: 100%; gap: 0; }
.overflow-toolbar-item[data-toolbar-presentation="menu"]::before { width: auto; height: 1px; margin: 5px 3px; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] .overflow-toolbar-item-content { flex-direction: column; align-items: stretch; width: 100%; gap: 0; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep([role="group"]), .overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.search-match-stepper) { flex-direction: column; align-items: stretch; gap: 0; padding: 0; background: transparent; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.histoire-toolbar-anchor) { display: flex; width: 100%; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.histoire-toolbar-button) { justify-content: flex-start; width: 100%; height: auto; min-height: 32px; padding: 6px 8px; gap: 9px; text-align: start; white-space: normal; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.toolbar-action-label) { display: inline; flex: 1; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.toolbar-action-shortcut) { display: inline; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.toolbar-menu-only) { display: inline-flex; }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.toolbar-action-value) { display: inline-flex; align-items: center; gap: 4px; color: var(--histoire-muted); }
.overflow-toolbar-item[data-toolbar-presentation="menu"] :deep(.search-match-count) { padding: 4px 8px; text-align: start; }
</style>
