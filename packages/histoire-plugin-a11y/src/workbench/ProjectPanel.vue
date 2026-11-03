<script setup lang="ts">
import type { PluginPreferences, WorkbenchContext } from '@histoire/plugin-kit'
import type { NodeFinding } from './locate.js'
import type { AuditModel } from './model.js'
import type { ProjectGroup, VariantTitles } from './project-model.js'
import type { ProjectSource } from './project-source.js'
import { HstSelect } from '@histoire/controls/vue'
import { WorkbenchEmptyState, WorkbenchErrorState, WorkbenchLoadingState, WorkbenchPaneHeader, WorkbenchPanelAction, WorkbenchPaneList, WorkbenchPaneToolbar } from '@histoire/plugin-kit/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { OUTCOME_OPTIONS, SEVERITY_OPTIONS, useFindingFilters } from './filters.js'
import { projectGroups, worstImpact } from './project-model.js'
import VariantGroup from './VariantGroup.vue'

const props = defineProps<{
  /** Root workbench context (catalog and navigation). */
  context: WorkbenchContext
  /** Project results source. */
  source: ProjectSource
  /** Plugin preferences holding the shared filters. */
  preferences: PluginPreferences
  /** Live audit model, highlighting through the inspector tab's frame visit. */
  model: AuditModel
}>()

const state = shallowRef(props.source.get())
onScopeDispose(props.source.subscribe(() => state.value = props.source.get()))
const { outcome, severity } = useFindingFilters(props.preferences)

// Titles come from the catalog; reloaded when results change since stories may have changed too.
const titles = shallowRef(new Map<string, VariantTitles>())
watch(() => state.value.results, async () => {
  try {
    const stories = await props.context.catalog.list()
    titles.value = new Map(stories.flatMap(story => story.variants.map(variant => [getHistoireTargetKey({ storyId: story.id, variantId: variant.id }), { story: story.title, variant: variant.title }])))
  }
  catch { /* Ids remain readable when the catalog is unavailable. */ }
}, { immediate: true })

const projection = computed(() => projectGroups(state.value.results, target => titles.value.get(getHistoireTargetKey(target)), { outcome: outcome.value, severity: severity.value }))
const hasResults = computed(() => state.value.results.some(result => result.report || result.error))
const determinate = computed(() => !!state.value.progress && state.value.progress.total > 0)
const PHASE_LABELS = { queued: 'Waiting to start', collect: 'Collecting stories', run: 'Checking variants' }
const phaseLabel = computed(() => PHASE_LABELS[state.value.progress?.phase ?? 'run'])
const errorTitle = computed(() => state.value.kind === 'build' ? 'Accessibility report unavailable' : 'Accessibility checks failed')
const generatedAt = computed(() => state.value.generatedAt ? new Date(state.value.generatedAt).toLocaleString() : undefined)

/** Select the variant unless it is current, and show its live accessibility tab. */
async function open(group: ProjectGroup): Promise<void> {
  const current = props.context.selection.target
  if (!current || getHistoireTargetKey(current) !== group.key) await props.context.navigation.selectStory(group.target)
  props.context.navigation.openInspectorTab('a11y:accessibility')
}

/**
 * Open the variant, then highlight the element in its canvas once the tab checked it live.
 * @param group Variant of the element.
 * @param finding Element to highlight.
 */
async function highlight(group: ProjectGroup, finding: NodeFinding): Promise<void> {
  await open(group)
  await props.model.locate(group.target, finding)
}
</script>

<template>
  <section class="histoire-a11y" aria-label="Accessibility issues">
    <WorkbenchPaneHeader title="Accessibility">
      <WorkbenchPanelAction v-if="state.kind === 'tests'" icon="play-filled-alt" label="Run all" :disabled="!state.canRun || state.running" @click="source.runAll()" />
    </WorkbenchPaneHeader>
    <!-- Stories are collected before variants run; each phase has its own count. -->
    <div v-if="state.kind === 'tests' && state.running" class="histoire-a11y-run-progress">
      <div class="histoire-a11y-progress" :data-indeterminate="determinate ? undefined : ''" role="progressbar" :aria-label="phaseLabel" aria-valuemin="0" :aria-valuemax="determinate ? state.progress!.total : undefined" :aria-valuenow="determinate ? state.progress!.completed : undefined">
        <span :style="determinate ? { width: `${state.progress!.completed / state.progress!.total * 100}%` } : undefined" />
      </div>
      <span v-if="determinate">{{ phaseLabel }} {{ state.progress!.completed }}/{{ state.progress!.total }}</span>
      <span v-else-if="state.progress">{{ phaseLabel }}</span>
    </div>
    <!-- The progress bar already signals test runs; only the report download uses the loading state. -->
    <WorkbenchEmptyState v-if="state.running && !hasResults && state.kind === 'tests'" icon="list-checked" tone="neutral" title="Checking accessibility" />
    <WorkbenchLoadingState v-else-if="state.running && !hasResults" title="Loading accessibility report" />
    <WorkbenchErrorState v-else-if="state.error && !hasResults" :title="errorTitle">
      {{ state.error }}
    </WorkbenchErrorState>
    <WorkbenchEmptyState v-else-if="!hasResults" icon="list-checked" tone="neutral" title="No results" />
    <template v-else>
      <!-- Counters as number + icon, like the inspector tab header; full wording in titles. -->
      <div class="histoire-a11y-counters histoire-a11y-summary" role="status" aria-live="polite">
        <span class="histoire-a11y-counter" :title="`${projection.totals.affected} of ${projection.totals.checked} variants with violations`">
          {{ projection.totals.affected }}/{{ projection.totals.checked }}<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11" /></svg><span class="histoire-a11y-sr">variants with violations</span>
        </span>
        <span class="histoire-a11y-counter histoire-a11y-severity-text" :data-impact="worstImpact(projection.groups.flatMap(group => group.findings))" :title="`${projection.totals.violations} ${projection.totals.violations === 1 ? 'violation' : 'violations'}`">
          {{ projection.totals.violations }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 11h.01" /></svg><span class="histoire-a11y-sr">{{ projection.totals.violations === 1 ? 'violation' : 'violations' }}</span>
        </span>
        <span v-if="projection.totals.failed" class="histoire-a11y-counter histoire-a11y-variant-failed" :title="`${projection.totals.failed} failed ${projection.totals.failed === 1 ? 'check' : 'checks'}`">
          {{ projection.totals.failed }}<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></svg><span class="histoire-a11y-sr">failed</span>
        </span>
        <span v-if="generatedAt" class="histoire-a11y-counter histoire-a11y-generated" :title="`Results from build ${generatedAt}`">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></svg>{{ generatedAt }}
        </span>
      </div>
      <!-- Earlier results stay usable after a failed run. -->
      <WorkbenchErrorState v-if="state.error" :title="errorTitle">
        {{ state.error }}
      </WorkbenchErrorState>
      <WorkbenchPaneToolbar>
        <div class="histoire-a11y-filters">
          <HstSelect v-model="outcome" class="histoire-a11y-filter" aria-label="Results" :options="OUTCOME_OPTIONS" />
          <HstSelect v-model="severity" class="histoire-a11y-filter" aria-label="Severity" :options="SEVERITY_OPTIONS" />
        </div>
      </WorkbenchPaneToolbar>
      <WorkbenchEmptyState v-if="!projection.groups.length" icon="checkmark" :title="outcome === 'violations' && severity === 'all' ? 'No violations found' : 'No matching findings'" />
      <WorkbenchPaneList v-else>
        <VariantGroup v-for="group in projection.groups" :key="group.key" :group="group" :outcome="outcome" @open="open(group)" @highlight="highlight(group, $event)" />
      </WorkbenchPaneList>
    </template>
  </section>
</template>
