<script setup lang="ts">
import type { RailBadgeTone } from './rail-items.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

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
  badgeTone?: RailBadgeTone
  /** Existing integration selector. */
  testId?: string
  /** Capability unavailable while route is unregistered. */
  disabled?: boolean
}>()
</script>

<template>
  <HstButton
    icon-only
    color="flat"
    type="button"
    class="histoire-rail-button"
    :aria-label="badge ? `${label} (${badge}${badgeTone === 'attention' ? ', needs your input' : ''})` : label"
    :title="label"
    :aria-pressed="active"
    :aria-expanded="expanded"
    :aria-controls="controls"
    :data-test-id="testId"
    :disabled="disabled"
  >
    <BuiltinIcon :icon="icon" :size="22" />
    <span v-if="badge" class="histoire-rail-badge" :data-tone="badgeTone" aria-hidden="true" />
  </HstButton>
</template>

<style scoped>
.histoire-rail-button {
  --histoire-icon-button-size: var(--histoire-rail-button-size, 40px);
  position: relative;
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
/* Waiting for the user: larger agent dot with a ring, static so it never reads as busy. */
.histoire-rail-badge[data-tone="attention"] { inset-block-start: 5px; inset-inline-end: 5px; width: 9px; height: 9px; background: var(--histoire-agent); box-shadow: 0 0 0 2px var(--histoire-surface), 0 0 0 3px var(--histoire-agent); }
</style>
