<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { useShell } from '../../composables/shell.js'
import PanelResizeHandle from './PanelResizeHandle.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineProps<{
  /** Inspector region controlled by its resize separator. */
  id: string
  /** Accessible inspector region name, independent of selected content. */
  label?: string
}>()
const emit = defineEmits<{ close: [] }>()
const shell = useShell()
</script>

<template>
  <aside :id="id" class="histoire-inspector-frame" :aria-label="label ?? 'Story inspector'" :style="{ width: `${shell.inspectorWidth.value}px` }">
    <PanelResizeHandle :controls="id" label="Resize inspector" edge="start" :model-value="shell.inspectorWidth.value" :min="shell.inspectorWidthBounds.value.min" :max="shell.inspectorWidthBounds.value.max" @update:model-value="shell.setInspectorWidth" />
    <header v-if="$slots.header" class="histoire-inspector-frame-header">
      <slot name="header" />
      <HstButton color="flat" type="button" aria-label="Close inspector" @click="emit('close')">
        <WorkbenchIcon name="close" :size="18" />
      </HstButton>
    </header>
    <div class="histoire-inspector-frame-content">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.histoire-inspector-frame { display: flex; flex-direction: column; position: absolute; inset-block: 12px; inset-inline-end: 12px; width: 344px; max-width: calc(100% - 24px); z-index: 30; border-radius: 16px; background: var(--histoire-surface); box-shadow: var(--histoire-shadow-panel); overflow: hidden; }
.histoire-inspector-frame-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; }
.histoire-inspector-frame-header button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; }
.histoire-inspector-frame-header button:hover { background: var(--histoire-chip); }
.histoire-inspector-frame-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; }
@container (max-width: 640px) {
  .histoire-inspector-frame { inset-block-start: 64px; }
}
</style>
