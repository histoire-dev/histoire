<script setup lang="ts">
import { HistoireControls, useHistoireSnapshot } from '@histoire/vue'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingSkeleton from '../shell/WorkbenchLoadingSkeleton.vue'

defineEmits<{ error: [error: unknown] }>()
const snapshot = useHistoireSnapshot()
</script>

<template>
  <section class="inspector-props" data-test-id="story-controls" aria-label="Props">
    <slot name="matrix">
      <HistoireControls compact-presets @error="$emit('error', $event)">
        <template #loading>
          <WorkbenchLoadingSkeleton label="Loading controls" :rows="4" />
        </template>
        <template #unavailable>
          <WorkbenchLoadingSkeleton v-if="snapshot.status === 'ready' && snapshot.selection?.variantId && !snapshot.stale && snapshot.runtime.status !== 'failed'" label="Loading controls" :rows="4" />
          <WorkbenchEmptyState v-else icon="cursor-1" title="Select a variant" />
        </template>
      </HistoireControls>
    </slot>
  </section>
</template>

<style scoped>
.inspector-props { min-width: 0; }
/* Row padding contributes to the content gutter; hover backgrounds extend around it. */
.inspector-props :deep(.histoire-controls) { padding: 0 calc(var(--histoire-inspector-gutter, 16px) - var(--histoire-control-wrapper-padding, 8px)) 16px; }
.inspector-props :deep(.histoire-state-presets) { margin: 2px var(--histoire-control-wrapper-padding, 8px) 20px; }
.inspector-props :deep(.histoire-preset-trigger) { width: var(--histoire-control-height, 34px); height: var(--histoire-control-height, 34px); padding: 0; }
.inspector-props :deep(.histoire-controls-reset) { align-self: start; margin: 2px var(--histoire-control-wrapper-padding, 8px) 0; height: var(--histoire-control-height, 34px); }
.inspector-props :deep(.workbench-state) { margin-inline: var(--histoire-control-wrapper-padding, 8px); }
.inspector-props :deep(.histoire-controls fieldset) { padding: 0; margin: 0 0 14px; border: 0; }
.inspector-props :deep(.histoire-controls legend) { padding: 0; margin-inline: var(--histoire-control-wrapper-padding, 8px); margin-bottom: 10px; color: var(--histoire-muted); font-size: 13px; }
</style>
