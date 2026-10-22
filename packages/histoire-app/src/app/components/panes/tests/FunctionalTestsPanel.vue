<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchTestRow } from './types.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc, HstSwitch } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, ref, useId } from 'vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import WorkbenchPaneHeader from '../../shell/WorkbenchPaneHeader.vue'
import WorkbenchPanelAction from '../../shell/WorkbenchPanelAction.vue'

import { useWorkbenchTestsModel } from './model.js'
import TestsFilter from './TestsFilter.vue'
import TestsSummary from './TestsSummary.vue'
import TestsTree from './TestsTree.vue'

const emit = defineEmits<{ select: [target: HistoireTarget], error: [error: unknown] }>()
const { session } = useHistoireContext()
const snapshot = useHistoireSnapshot()
const model = useWorkbenchTestsModel()
const filter = ref<'failing' | 'all' | 'changed'>('failing')
const watchModeId = `histoire-watch-tests-${useId()}`
let active = true
useHistoireResource(() => {
  active = false
})
const issue = computed(() => {
  const error = model?.error.value ?? model?.discoveryError.value
  return error ? (error instanceof Error ? error.message : String(error)).split('\n')[0] : null
})
/** Keep partial collection rows usable; replace only failed empty collection. */
const collectionFailed = computed(() => model?.discoveryStatus.value === 'error' && !model.visibleRows.value.length)
/** Selection is canonical; root translates successful activation into inspector Tests tab. */
async function select(row: WorkbenchTestRow) {
  if (!row.selectable) return
  const source = session.getSnapshot().source
  try {
    await session.selection.select(row.target)
    const current = session.getSnapshot()
    if (active && !current.stale && current.selection && getHistoireTargetKey(current.selection) === getHistoireTargetKey(row.target) && current.source?.sourceId === source?.sourceId && current.source?.epoch === source?.epoch && current.source?.revision === source?.revision) emit('select', row.target)
  }
  catch (error) { if (active) emit('error', error) }
}
</script>

<template>
  <section class="tests-panel" aria-label="Tests">
    <WorkbenchPaneHeader title="Tests">
      <HstButton color="flat" type="button" class="refresh-tests" aria-label="Refresh tests" title="Refresh tests" :disabled="!model?.canRefresh.value" @click="model?.retryCollection()">
        <BuiltinIcon icon="renew" :size="16" />
      </HstButton>
      <WorkbenchPanelAction v-if="model?.running.value" icon="stop-filled-alt" label="Stop" @click="model.cancel()" />
      <WorkbenchPanelAction v-else icon="play-filled-alt" label="Run all" :disabled="!model?.canRun.value" @click="model?.runAll()" />
    </WorkbenchPaneHeader>
    <template v-if="model">
      <TestsSummary :summary="model.summary.value" :running="model.running.value" :completed="model.completed.value" :total="model.total.value" />
      <TestsFilter v-model="filter" />
      <div v-if="['collecting', 'error'].includes(model.discoveryStatus.value) && model.discoveryProgress.value.completed" class="collection-progress" role="status">
        <HstPulsatingDisc v-if="model.discoveryStatus.value === 'collecting'" :size="12" />
        {{ model.discoveryStatus.value === 'collecting' ? 'Collecting tests…' : 'Collected targets' }} {{ model.discoveryProgress.value.completed }}/{{ model.discoveryProgress.value.total }}
      </div>
      <p v-if="issue && !collectionFailed" class="test-issue" role="alert">
        {{ issue }}
      </p>
      <HstButton v-if="model.discoveryStatus.value === 'error' && !collectionFailed" color="flat" type="button" class="retry-collection" @click="model.retryCollection()">
        Retry collection
      </HstButton>
      <WorkbenchErrorState v-if="collectionFailed" title="Test collection failed">
        {{ issue }}
        <template #actions>
          <HstButton color="flat" type="button" @click="model.retryCollection()">
            Retry collection
          </HstButton>
        </template>
      </WorkbenchErrorState>
      <WorkbenchLoadingState v-else-if="model.discoveryStatus.value === 'collecting' && !model.discoveryProgress.value.completed && !model.visibleRows.value.length" title="Collecting tests…" />
      <TestsTree v-else-if="model.discoveryStatus.value !== 'error' || model.visibleRows.value.length" :rows="model.visibleRows.value" :filter="filter" :selected="snapshot.selection" @select="select" />
      <footer>
        <label :for="watchModeId" class="watch-mode-row" :class="{ disabled: !model.canRun.value }">
          <BuiltinIcon icon="view" :size="16" />
          <span>Watch mode</span>
          <HstSwitch :id="watchModeId" layout="inline" aria-label="Watch tests" :model-value="model.watchTests.value" :disabled="!model.canRun.value" @update:model-value="model.setWatch($event)" />
        </label>
      </footer>
    </template>
    <WorkbenchEmptyState v-else icon="test-tool" title="Server tests unavailable" />
  </section>
</template>

<style scoped>
.tests-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--histoire-surface); color: var(--histoire-text); }
.refresh-tests { display: inline-flex; align-items: center; justify-content: center; padding: 8px; }
.test-issue { margin: 10px var(--histoire-pane-gutter); color: var(--histoire-danger-text); font-size: 12px; overflow-wrap: anywhere; white-space: pre-line; }
.retry-collection { margin: 10px var(--histoire-pane-gutter); align-self: flex-start; }
.collection-progress { display: flex; align-items: center; gap: 8px; margin: 10px var(--histoire-pane-gutter); color: var(--histoire-muted); font-size: 12px; }
footer { margin-top: auto; border-top: 1px solid var(--histoire-border); }
.watch-mode-row { display: flex; align-items: center; gap: 9px; box-sizing: border-box; inline-size: 100%; min-inline-size: 0; padding: 14px var(--histoire-pane-gutter); cursor: pointer; }
.watch-mode-row:hover { background: var(--histoire-chip); }
.watch-mode-row.disabled { cursor: default; }
.watch-mode-row.disabled:hover { background: transparent; }
.watch-mode-row > svg { flex: none; color: var(--histoire-muted); }
.watch-mode-row > span { flex: 1; min-inline-size: 0; font-size: 12px; font-weight: 700; }
.watch-mode-row :deep(.histoire-switch) { flex: none; }
</style>
