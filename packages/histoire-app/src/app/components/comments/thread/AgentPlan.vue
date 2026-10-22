<script setup lang="ts">
import type { UiAgentPlanEntry } from '@histoire/shared'
import { BuiltinIcon, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  /** Plan entries in agent order. */
  entries: readonly UiAgentPlanEntry[]
  /** The agent is still working on this plan. */
  live?: boolean
}>()
/** Completed entry count. */
const done = computed(() => props.entries.filter(entry => entry.status === 'completed').length)
/** User toggle; `undefined` follows the default (open until every entry is done). */
const toggled = ref<boolean>()
const open = computed(() => toggled.value ?? done.value < props.entries.length)
/** Static glyph per settled status; live running entries use the pulsating disc. */
const icons: Record<UiAgentPlanEntry['status'], string> = { pending: 'circle-dash', in_progress: 'in-progress', completed: 'checkmark-filled' }
</script>

<template>
  <section class="agent-plan" aria-label="Agent plan">
    <button type="button" class="plan-row" :aria-expanded="open" @click="toggled = !open">
      <BuiltinIcon class="chevron" :class="{ open }" icon="chevron-right" :size="12" />
      <BuiltinIcon icon="list-checked" :size="14" />
      <strong>Plan</strong>
      <span class="summary">{{ done }}/{{ entries.length }} done</span>
    </button>
    <ol v-if="open" class="plan-entries">
      <li v-for="(entry, index) in entries" :key="index" :data-status="entry.status">
        <HstPulsatingDisc v-if="live && entry.status === 'in_progress'" class="status" :size="10" />
        <BuiltinIcon v-else class="status" :icon="icons[entry.status]" :size="12" />
        <span class="content">{{ entry.content }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.agent-plan { min-width: 0; margin-bottom: 6px; font-size: 11px; color: var(--histoire-muted); }
.plan-row { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 3px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.plan-row strong { color: var(--histoire-body); font-weight: 600; }
.chevron { transition: transform 120ms ease-out; }
.chevron.open { transform: rotate(90deg); }
.plan-entries { display: grid; gap: 3px; margin: 2px 0 4px; padding: 0 0 0 18px; list-style: none; }
.plan-entries li { display: flex; align-items: flex-start; gap: 6px; min-width: 0; line-height: 1.45; }
.status { flex: none; width: 12px; margin-top: 2px; }
.content { min-width: 0; overflow-wrap: anywhere; }
[data-status="in_progress"] .content { color: var(--histoire-body); font-weight: 600; }
[data-status="completed"] .content { text-decoration: line-through; }
[data-status="completed"] .status { color: var(--histoire-accent-link); }
@media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
