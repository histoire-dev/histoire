<script setup lang="ts">
import type { UiVisualResult } from '@histoire/shared'
import type { VisualFilter } from './projection.js'
import { HstButton, HstButtonGroup, HstSelect } from '@histoire/controls/vue'
import { computed, onMounted, ref, useId } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import WorkbenchPaneHeader from '../../shell/WorkbenchPaneHeader.vue'
import WorkbenchPaneToolbar from '../../shell/WorkbenchPaneToolbar.vue'
import { countVisualResults, matchesVisualFilter } from './projection.js'
import VisualResultsList from './VisualResultsList.vue'
import VisualRunButton from './VisualRunButton.vue'
import VisualTestsSummary from './VisualTestsSummary.vue'

const model = useWorkbenchVisual()!
const filter = ref<VisualFilter>('changes')
const id = useId()
const running = computed(() => !!model.requestId.value)
/** Existing results remain reviewable after an action fails. */
const panelFailed = computed(() => !!model.issue.value && !model.results.value.length && !running.value && !model.inventoryLoading.value)
const counts = computed(() => countVisualResults(model.results.value))
/** Empty state uses same predicate as grouped result rows. */
const hasVisibleResults = computed(() => model.results.value.some(result => matchesVisualFilter(result, filter.value)))
const profileOptions = computed(() => [{ value: '', label: 'All profiles' }, ...model.profiles.value.map(profile => ({ value: profile.id, label: profile.id }))])
const baselineOptions = computed(() => [{ value: 'working', label: 'Working tree' }, { value: 'main', label: model.baselineRef.value }])
/** Captures planned by next run, shown before anything was compared. */
const planned = computed(() => {
  const profiles = model.profileId.value ? 1 : Math.max(model.profiles.value.length, 1)
  return `${model.cases.value.length.toLocaleString()} cases × ${profiles} ${profiles === 1 ? 'profile' : 'profiles'}`
})
/** Checkboxes select reviewed captures; errors and stale evidence cannot be approved. */
function canApprove(result: UiVisualResult): boolean {
  return !result.staleReason && !model.busy(result) && !!result.reviewHandle && !result.approved && !!result.currentHash && ['missing', 'changed', 'incompatible'].includes(result.status)
}
const approvable = computed(() => model.results.value.filter(canApprove).map(result => result.id))
const allSelected = computed(() => approvable.value.length > 0 && approvable.value.every(value => model.selectedIds.value.includes(value)))
/** Explicit bulk selection; approving still needs its own click. */
function toggleAll(): void {
  model.selectedIds.value = allSelected.value ? [] : [...approvable.value]
}
onMounted(() => {
  if (!model.cases.value.length) {
    void model.refresh()
  }
})
</script>

<template>
  <section class="visual-panel" aria-label="Visual tests">
    <WorkbenchPaneHeader title="Visual tests">
      <VisualRunButton />
    </WorkbenchPaneHeader>
    <div class="options">
      <template v-if="model.profiles.value.length > 1">
        <label :for="`${id}-profile`">Profile</label>
        <HstSelect :id="`${id}-profile`" v-model="model.profileId.value" title="Profile" layout="inline" :disabled="running" :options="profileOptions" />
      </template>
      <label :for="`${id}-baseline`">Baseline</label>
      <HstSelect :id="`${id}-baseline`" v-model="model.baselineSource.value" title="Baseline" layout="inline" :disabled="running" :options="baselineOptions" />
    </div>
    <VisualTestsSummary v-if="model.results.value.length || running" :counts="counts" :running="running" :completed="model.completed.value" :total="running ? model.run.value?.total ?? 0 : model.results.value.length" :stale="model.results.value.some(result => !!result.staleReason)" />
    <WorkbenchPaneToolbar v-if="model.results.value.length">
      <HstButtonGroup v-model="filter" layout="inline" aria-label="Visual results filter" :options="[{ value: 'changes', label: 'Changes' }, { value: 'errors', label: 'Errors' }, { value: 'all', label: 'All' }]" />
    </WorkbenchPaneToolbar>
    <p v-if="model.issue.value && !panelFailed" class="issue" role="alert">
      {{ model.issue.value }}
    </p>
    <WorkbenchLoadingState v-if="model.inventoryLoading.value && !model.run.value" title="Loading visual cases…" />
    <WorkbenchLoadingState v-else-if="running && !model.results.value.length" title="Comparing images…">
      {{ model.completed.value }} of {{ model.run.value?.total ?? model.cases.value.length }}
    </WorkbenchLoadingState>
    <WorkbenchErrorState v-else-if="panelFailed" title="Visual tests failed">
      {{ model.issue.value }}
      <template #actions>
        <HstButton color="flat" type="button" @click="model.cases.value.length ? model.start({ incremental: true }) : model.refresh()">
          Retry
        </HstButton>
      </template>
    </WorkbenchErrorState>
    <template v-else-if="model.results.value.length">
      <VisualResultsList v-if="hasVisibleResults" :filter="filter" :can-approve="canApprove" />
      <WorkbenchEmptyState v-else icon="checkmark" :title="filter === 'errors' ? 'No errors' : 'No visual changes'">
        <template #actions>
          <HstButton color="flat" type="button" @click="filter = 'all'">
            Show all results
          </HstButton>
        </template>
      </WorkbenchEmptyState>
    </template>
    <WorkbenchEmptyState v-else-if="!model.cases.value.length" icon="camera" title="No visual cases" />
    <WorkbenchEmptyState v-else icon="camera" title="Ready to compare">
      {{ planned }}
    </WorkbenchEmptyState>
    <WorkbenchLoadingState v-if="model.approving.value" class="approval-loading" title="Approving screenshots…" />
    <footer v-else-if="approvable.length">
      <label class="select-all">
        <input type="checkbox" :checked="allSelected" :indeterminate="!allSelected && model.selectedIds.value.length > 0" @change="toggleAll">
        Select all
      </label>
      <HstButton color="primary" type="button" class="approve" :disabled="!model.selectedIds.value.length" @click="model.approve([...model.selectedIds.value])">
        Approve {{ model.selectedIds.value.length }} selected
      </HstButton>
    </footer>
  </section>
</template>

<style scoped>
.visual-panel { display: flex; flex-direction: column; min-height: 0; height: 100%; }
/* Label column sizes to longest label so selects line up. */
.options { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px 12px; padding: 0 var(--histoire-pane-gutter) 16px; }
.options label { color: var(--histoire-muted); font-size: 12px; }
.options :deep(.histoire-select) { --histoire-control-margin: 0px; min-width: 0; }
.issue { margin: 10px var(--histoire-pane-gutter); color: var(--histoire-danger-text); white-space: pre-line; font-size: 12px; overflow-wrap: anywhere; }
.approval-loading { flex: none; margin: 16px var(--histoire-pane-gutter); }
footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding: 10px var(--histoire-pane-gutter); border-top: 1px solid var(--histoire-border); }
.select-all { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
.select-all input { margin: 0; accent-color: var(--histoire-accent); }
.approve { display: inline-flex; align-items: center; gap: 6px; }
</style>
