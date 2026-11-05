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
  /** Count or short status text supplies accessible status and small visual badge. */
  badge?: number | string
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
    class="htw:relative htw:text-muted htw:[--histoire-icon-button-size:var(--histoire-rail-button-size,40px)] htw:hover:text-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent htw:focus-visible:outline-offset-2 htw:disabled:opacity-40 htw:disabled:cursor-default"
    :aria-label="badge ? `${label} (${badge}${badgeTone === 'attention' ? ', needs your input' : ''})` : label"
    :title="label"
    :aria-pressed="active"
    :aria-expanded="expanded"
    :aria-controls="controls"
    :data-test-id="testId"
    :data-histoire-contribution="$attrs['data-shell-pane']"
    :disabled="disabled"
  >
    <BuiltinIcon :icon="icon" :size="22" />
    <span v-if="badge" class="htw:absolute htw:top-1.5 htw:end-1.5 htw:size-[7px] htw:rounded-full htw:bg-danger htw:data-[tone=agent]:bg-agent htw:data-[tone=accent]:bg-accent htw:data-[tone=attention]:top-[5px] htw:data-[tone=attention]:end-[5px] htw:data-[tone=attention]:size-[9px] htw:data-[tone=attention]:bg-agent htw:data-[tone=attention]:shadow-[0_0_0_2px_var(--histoire-surface),0_0_0_3px_var(--histoire-agent)]" :data-tone="badgeTone" aria-hidden="true" />
  </HstButton>
</template>
