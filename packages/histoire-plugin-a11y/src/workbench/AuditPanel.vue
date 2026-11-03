<script setup lang="ts">
import type { FrameScopedContext } from '@histoire/plugin-kit'
import type { NodeFinding } from './locate.js'
import type { AuditModel, AuditState } from './model.js'
import { HstButton, HstPulsatingDisc, HstSelect, HstSwitch } from '@histoire/controls/vue'
import { WorkbenchEmptyState, WorkbenchErrorState, WorkbenchLoadingState, WorkbenchPanelAction } from '@histoire/plugin-kit/vue'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { IMPACTS } from '../scanner/policy.js'
import { nodeKey } from '../scanner/run.js'
import { OUTCOME_OPTIONS, SEVERITY_OPTIONS, useFindingFilters } from './filters.js'
import FindingRow from './FindingRow.vue'
import { worstImpact } from './project-model.js'

const props = defineProps<{
  /** Current actor scope supplied by host. */
  context: FrameScopedContext
  /** Host-isolated audit model. */
  model: AuditModel
}>()
const state = shallowRef<AuditState>()
const revision = ref(0)
let stop: (() => void) | undefined
watch(() => props.context.frame.key, (key) => {
  stop?.()
  stop = props.model.watch(key, () => {
    state.value = props.model.get(key)
    revision.value++
  })
}, { immediate: true })
onScopeDispose(() => stop?.())

const autoRun = computed({
  get: () => {
    void revision.value
    return props.model.autoRun()
  },
  set: value => props.model.preferences.set('autoRun', value),
})
const { outcome, severity } = useFindingFilters(props.model.preferences)
const findings = computed(() => [...state.value?.report?.[outcome.value] ?? []]
  .filter(rule => severity.value === 'all' || (rule.impact ?? 'unknown') === severity.value)
  .sort((a, b) => (IMPACTS[b.impact!] ?? 0) - (IMPACTS[a.impact!] ?? 0) || a.id.localeCompare(b.id)))

/**
 * Highlight an element of this frame's live report through its private handle.
 * @param finding Element to highlight.
 */
function highlight(finding: NodeFinding): void {
  props.model.highlight(props.context.frame.key, nodeKey(finding.outcome, finding.rule, finding.selectors))
}

/** Start manual scan without changing live-audit preference. */
function run(): void {
  props.model.run(props.context.frame.key)
}
</script>

<template>
  <!-- The inspector already pads tab content: blocks only get one shared gap, no pane gutters. -->
  <section class="histoire-a11y histoire-a11y-tab" aria-label="Accessibility audit">
    <!-- One row: result counters as number + icon, then the run controls, all on the same gap. -->
    <div class="histoire-a11y-tab-header">
      <div v-if="state?.report" class="histoire-a11y-counters" role="status" aria-live="polite">
        <HstPulsatingDisc v-if="state.running" :size="12" />
        <span class="histoire-a11y-counter histoire-a11y-severity-text" :data-impact="worstImpact(state.report.violations)" :title="`${state.report.violationsCount} ${state.report.violationsCount === 1 ? 'violation' : 'violations'}`">
          {{ state.report.violationsCount }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 11h.01" /></svg><span class="histoire-a11y-sr">{{ state.report.violationsCount === 1 ? 'violation' : 'violations' }}</span>
        </span>
        <span class="histoire-a11y-counter" :title="`${state.report.incompleteCount} need review`">
          {{ state.report.incompleteCount }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.3M8 11.2h.01" /></svg><span class="histoire-a11y-sr">need review</span>
        </span>
        <span class="histoire-a11y-counter" :title="`${state.report.passesCount} passed`">
          {{ state.report.passesCount }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M5.5 8.2l1.7 1.7 3.3-3.6" /></svg><span class="histoire-a11y-sr">passed</span>
        </span>
        <span class="histoire-a11y-counter" :title="`${state.report.inapplicableCount} inapplicable`">
          {{ state.report.inapplicableCount }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M5.5 8h5" /></svg><span class="histoire-a11y-sr">inapplicable</span>
        </span>
        <span v-if="state.stale && !state.running" class="histoire-a11y-counter" title="Results may be outdated">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg><span class="histoire-a11y-sr">Results may be outdated</span>
        </span>
      </div>
      <label class="histoire-a11y-auto"><HstSwitch v-model="autoRun" layout="inline" aria-label="Auto-run" />Auto-run</label>
      <WorkbenchPanelAction icon="play-filled-alt" label="Run" :disabled="!state || state.running" @click="run" />
    </div>
    <WorkbenchEmptyState v-if="!state" icon="list-checked" title="No variant available" />
    <WorkbenchLoadingState v-else-if="state.running && !state.report" title="Checking accessibility" />
    <WorkbenchErrorState v-else-if="state.error && !state.report" title="Accessibility check failed">
      {{ state.error }}
      <template #actions>
        <HstButton @click="run">
          Try again
        </HstButton>
      </template>
    </WorkbenchErrorState>
    <WorkbenchEmptyState v-else-if="!state.report" icon="list-checked" title="Ready to check">
      <template #actions>
        <HstButton @click="run">
          Run checks
        </HstButton>
      </template>
    </WorkbenchEmptyState>
    <template v-else>
      <WorkbenchErrorState v-if="state.error" title="Accessibility check failed">
        {{ state.error }}
        <template #actions>
          <HstButton @click="run">
            Try again
          </HstButton>
        </template>
      </WorkbenchErrorState>
      <div class="histoire-a11y-filters">
        <HstSelect v-model="outcome" class="histoire-a11y-filter" aria-label="Results" :options="OUTCOME_OPTIONS" />
        <HstSelect v-model="severity" class="histoire-a11y-filter" aria-label="Severity" :options="SEVERITY_OPTIONS" />
      </div>
      <WorkbenchEmptyState v-if="!findings.length" icon="checkmark" :title="!state.report.violationsCount && outcome === 'violations' && !state.report.truncated ? 'No violations found' : outcome === 'incomplete' && !state.report.incompleteCount && !state.report.truncated ? 'No checks need review' : 'No matching findings'">
        <template v-if="state.report.incompleteCount && !state.report.violationsCount">
          {{ state.report.incompleteCount }} rules need manual review
        </template>
      </WorkbenchEmptyState>
      <div v-else class="histoire-a11y-tab-list">
        <FindingRow v-for="rule in findings" :key="`${outcome}:${rule.id}`" :rule="rule" :outcome="outcome" @highlight="highlight" />
      </div>
      <p v-if="state.report.droppedCount" class="histoire-a11y-note" role="status">
        {{ state.report.droppedCount }} result details omitted
      </p>
      <p v-if="state.feedback" class="histoire-a11y-note" role="status">
        {{ state.feedback }}
      </p>
    </template>
  </section>
</template>
