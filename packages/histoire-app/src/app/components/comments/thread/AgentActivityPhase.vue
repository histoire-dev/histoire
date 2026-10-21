<script setup lang="ts">
import type { UiAgentStep } from '@histoire/shared'
import type { ActivityPhase } from './activity-phases.js'
import { BuiltinIcon, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { isStepRunning } from './activity-phases.js'

const props = defineProps<{
  /** Grouped consecutive steps. */
  phase: ActivityPhase
}>()
/** Glyph per phase family. */
const phaseIcons: Record<ActivityPhase['kind'], string> = { explore: 'search', edit: 'edit', run: 'terminal', other: 'settings' }
/** Glyph per ACP tool kind. */
const stepIcons: Record<UiAgentStep['kind'], string> = { read: 'document', search: 'search', think: 'light', fetch: 'link', edit: 'edit', delete: 'trash-can', move: 'move', execute: 'terminal', other: 'settings' }
/** User toggle; `undefined` follows the default (open while running or failed). */
const toggled = ref<boolean>()
const open = computed(() => props.phase.status === 'running' || (toggled.value ?? props.phase.status === 'failed'))
/** Thought-only phases have nothing to expand. */
const expandable = computed(() => props.phase.steps.some(step => step.kind !== 'think'))
</script>

<template>
  <div class="activity-phase" :data-status="phase.status">
    <button type="button" class="phase-row" :aria-expanded="expandable ? open : undefined" :disabled="!expandable" @click="toggled = !open">
      <BuiltinIcon v-if="expandable" class="chevron" :class="{ open }" icon="chevron-right" :size="12" />
      <BuiltinIcon :icon="phaseIcons[phase.kind]" :size="14" />
      <strong>{{ phase.title }}</strong>
      <span v-if="phase.summary" class="summary">{{ phase.summary }}</span>
      <span v-if="phase.added || phase.removed" class="counts"><span class="added">+{{ phase.added }}</span> <span class="removed">-{{ phase.removed }}</span></span>
      <span v-if="phase.status === 'failed'" class="failed">failed</span>
      <HstPulsatingDisc v-if="phase.status === 'running'" :size="10" />
    </button>
    <ul v-if="open && expandable" class="phase-steps">
      <li v-for="step in phase.steps" :key="step.id" :data-status="step.status">
        <BuiltinIcon :icon="stepIcons[step.kind]" :size="12" />
        <span class="step-title">{{ step.title }}</span>
        <code v-if="step.target && !step.title.includes(step.target)">{{ step.target }}</code>
        <span v-if="step.added || step.removed" class="counts"><span class="added">+{{ step.added ?? 0 }}</span> <span class="removed">-{{ step.removed ?? 0 }}</span></span>
        <BuiltinIcon v-if="step.status === 'failed'" class="failed" icon="error-filled" :size="12" />
        <HstPulsatingDisc v-else-if="isStepRunning(step)" :size="8" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.activity-phase { min-width: 0; font-size: 11px; color: var(--histoire-muted); }
.phase-row { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 3px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.phase-row:disabled { cursor: default; }
.phase-row strong { color: var(--histoire-body); font-weight: 600; }
.summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron { transition: transform 120ms ease-out; }
.chevron.open { transform: rotate(90deg); }
.counts { flex: none; }
.added { color: var(--histoire-accent-link); }
.removed, .failed { color: var(--histoire-danger-text); }
.phase-steps { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; margin: 2px 0 4px; padding: 0 0 0 18px; list-style: none; }
.phase-steps li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.step-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phase-steps code { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
@media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
