<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchTestRow } from './types.js'
import { HstButton, HstSwitch } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, ref } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import { useWorkbenchTestsModel } from './model.js'
import TestsFilter from './TestsFilter.vue'
import TestsSummary from './TestsSummary.vue'
import TestsTree from './TestsTree.vue'

const emit = defineEmits<{ select: [target: HistoireTarget], error: [error: unknown] }>()
const { session } = useHistoireContext()
const snapshot = useHistoireSnapshot()
const model = useWorkbenchTestsModel()
const filter = ref<'failing' | 'all' | 'changed'>('failing')
let active = true
useHistoireResource(() => {
  active = false
})
const issue = computed(() => {
  const error = model?.error.value ?? model?.discoveryError.value
  return error ? (error instanceof Error ? error.message : String(error)) : null
})
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
    <header>
      <h2>Tests</h2>
      <HstButton v-if="model?.running.value" color="primary" type="button" class="run-tests" @click="model.cancel()">
        <WorkbenchIcon name="stop-filled-alt" />Stop
      </HstButton>
      <HstButton v-else color="primary" type="button" class="run-tests" :disabled="!model?.canRun.value" @click="model?.runAll()">
        <WorkbenchIcon name="play-filled-alt" />Run all
      </HstButton>
    </header>
    <template v-if="model">
      <TestsSummary :summary="model.summary.value" :running="model.running.value" :completed="model.completed.value" :total="model.total.value" />
      <TestsFilter v-model="filter" />
      <p v-if="issue" class="test-issue" role="alert">
        {{ issue }}
      </p>
      <HstButton v-if="model.discoveryStatus.value === 'error'" color="flat" type="button" class="retry-collection" @click="model.retryCollection()">
        Retry collection
      </HstButton>
      <p v-if="model.discoveryStatus.value === 'collecting' && !model.visibleRows.value.length" class="test-status" role="status">
        Collecting tests…
      </p>
      <TestsTree v-else-if="model.discoveryStatus.value !== 'error' || model.visibleRows.value.length" :rows="model.visibleRows.value" :filter="filter" :selected="snapshot.selection" @select="select" />
      <footer>
        <WorkbenchIcon name="view" />
        <span>Watch mode</span>
        <HstSwitch layout="inline" aria-label="Watch tests" :model-value="model.watchTests.value" :disabled="!model.canRun.value" @update:model-value="model.setWatch($event)" />
      </footer>
    </template>
    <p v-else class="test-issue">
      Server test execution is unavailable
    </p>
  </section>
</template>

<style scoped>
.tests-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--histoire-surface); color: var(--histoire-text); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; }
h2 { margin: 0; font-size: 14px; font-weight: 800; }
.run-tests { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; font-weight: 750; }
.test-issue { margin: 10px 16px; color: var(--histoire-danger-text); font-size: 12px; overflow-wrap: anywhere; white-space: pre-line; }
.test-status, .retry-collection { margin: 10px 16px; }
.retry-collection { align-self: flex-start; }
footer { display: flex; align-items: center; gap: 9px; margin-top: auto; padding: 14px 16px; border-top: 1px solid var(--histoire-border); }
footer > svg { color: var(--histoire-muted); }
footer > span { flex: 1; font-weight: 700; font-size: 12px; }
</style>
