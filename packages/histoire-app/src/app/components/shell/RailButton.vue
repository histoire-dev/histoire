<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineProps<{
  /** Accessible action label, also shown in native tooltip. */
  label: string
  /** Bundled Carbon icon name. */
  icon: string
  /** Highlight active destination. */
  active?: boolean
  /** Panel expanded state for local pane actions. */
  expanded?: boolean
  /** Associated panel ID when action expands a region. */
  controls?: string
  /** Count supplies accessible status and small visual badge. */
  badge?: number
  /** Badge status semantics shared with its rail destination. */
  badgeTone?: 'danger' | 'agent' | 'mcp'
  /** Existing integration selector. */
  testId?: string
  /** Capability unavailable while route is unregistered. */
  disabled?: boolean
}>()
</script>

<template>
  <HstButton
    color="flat"
    type="button"
    class="histoire-rail-button"
    :aria-label="badge ? `${label} (${badge})` : label"
    :title="label"
    :aria-pressed="active"
    :aria-expanded="expanded"
    :aria-controls="controls"
    :data-test-id="testId"
    :disabled="disabled"
  >
    <WorkbenchIcon :name="icon" :size="22" />
    <span v-if="badge" class="histoire-rail-badge" :data-tone="badgeTone" aria-hidden="true" />
  </HstButton>
</template>

<style scoped>
.histoire-rail-button {
  display: grid;
  place-items: center;
  position: relative;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0;
  color: var(--histoire-muted);
}
.histoire-rail-button:hover { color: var(--histoire-text); background: var(--histoire-chip); }
.histoire-rail-button[aria-pressed="true"] { color: var(--histoire-accent); background: var(--histoire-accent-soft); }
.histoire-rail-button:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
.histoire-rail-button:disabled { opacity: .4; cursor: default; }
.histoire-rail-badge {
  position: absolute;
  inset-block-start: 6px;
  inset-inline-end: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--histoire-danger);
}
.histoire-rail-badge[data-tone="agent"] { background: var(--histoire-agent); }
.histoire-rail-badge[data-tone="mcp"] { background: rgb(var(--histoire-agent-rgb) / .6); }
@container (max-width: 640px) {
  .histoire-rail-button { width: auto; min-width: 0; flex: 1 1 0; }
}
</style>
