<script setup lang="ts">
import { HistoireControls } from '@histoire/vue'

defineEmits<{ error: [error: unknown] }>()
</script>

<template>
  <section class="inspector-props" data-test-id="story-controls" aria-label="Props">
    <slot name="matrix">
      <HistoireControls compact-presets @error="$emit('error', $event)">
        <template #unavailable>
          <p class="inspector-empty">
            Select a ready preview to edit props.
          </p>
        </template>
      </HistoireControls>
    </slot>
  </section>
</template>

<style scoped>
.inspector-props { min-width: 0; }
.inspector-empty { margin: 24px 16px; color: var(--histoire-muted); font-size: 13px; }
.inspector-props :deep(.histoire-controls) { display: grid; grid-template-columns: 1fr auto; column-gap: 6px; padding: 0 16px 16px; }
.inspector-props :deep(.histoire-controls > *) { grid-column: 1 / -1; }
.inspector-props :deep(.histoire-state-presets) { grid-row: 1; grid-column: 1; gap: 6px; margin: 2px 0 20px; }
.inspector-props :deep(.histoire-preset-trigger) { width: var(--histoire-control-height, 34px); height: var(--histoire-control-height, 34px); padding: 0; }
.inspector-props :deep(.histoire-controls-reset) { grid-row: 1; grid-column: 2; align-self: start; margin: 2px 0 0; height: var(--histoire-control-height, 34px);  }
.inspector-props :deep(.histoire-controls fieldset) { padding: 0; margin: 0 0 14px; border: 0; }
.inspector-props :deep(.histoire-controls legend) { padding: 0; margin-bottom: 10px; color: var(--histoire-muted); font-size: 13px; }
.inspector-props :deep(.histoire-custom-controls iframe) { border: 0; }
</style>
