<script setup lang="ts">
import type { UiAgentPlanDecision } from '@histoire/shared'
import { BuiltinIcon } from '@histoire/controls/vue'
import { ref } from 'vue'
import AgentMarkdown from './AgentMarkdown.vue'

defineProps<{
  /** User answer to a plan approval card. */
  decision: UiAgentPlanDecision
}>()
/** Plan text stays collapsed until asked for. */
const open = ref(false)
</script>

<template>
  <section class="agent-plan-decision" aria-label="Plan decision" :data-outcome="decision.outcome">
    <button type="button" class="decision-row" :aria-expanded="decision.plan ? open : undefined" :disabled="!decision.plan" @click="open = !open">
      <BuiltinIcon v-if="decision.plan" class="chevron" :class="{ open }" icon="chevron-right" :size="12" />
      <BuiltinIcon icon="list-checked" :size="14" />
      <strong>Plan</strong>
      <span class="outcome">
        <BuiltinIcon :icon="decision.outcome === 'approved' ? 'checkmark-filled' : 'edit'" :size="12" />
        {{ decision.outcome === 'approved' ? 'Approved' : 'Kept planning' }}
      </span>
    </button>
    <AgentMarkdown v-if="open && decision.plan" class="decision-plan" :text="decision.plan" />
  </section>
</template>

<style scoped>
.agent-plan-decision { min-width: 0; margin-bottom: 6px; font-size: 11px; color: var(--histoire-muted); }
.decision-row { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 3px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.decision-row:disabled { cursor: default; }
.decision-row strong { color: var(--histoire-body); font-weight: 600; }
.outcome { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border: 1px solid var(--histoire-border); border-radius: 999px; background: var(--histoire-chip); font-size: 10px; font-weight: 500; line-height: 16px; }
[data-outcome="approved"] .outcome { color: var(--histoire-accent-link); }
.chevron { transition: transform 120ms ease-out; }
.chevron.open { transform: rotate(90deg); }
.decision-plan { margin: 2px 0 4px; padding: 8px 10px; border: 1px solid var(--histoire-border); border-radius: 6px; }
@media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
