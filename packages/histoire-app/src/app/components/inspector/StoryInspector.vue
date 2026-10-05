<script setup lang="ts">
import type { InspectorTab } from './state.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { HistoireDocs, HistoireEvents, HistoireTests } from '@histoire/vue'
import { useHistoireContext, useProvidedHistoireTestsModel } from '@histoire/vue/internal'
import { computed, ref, useId, watch } from 'vue'
import { useSelection } from '../../composables/selection.js'
import { useWorkbenchTestsModel } from '../panes/tests/model.js'
import InspectorHeader from './InspectorHeader.vue'
import InspectorTabs from './InspectorTabs.vue'
import PropsTab from './PropsTab.vue'
import SourceDrawer from './SourceDrawer.vue'
import { createInspectorEventCounter, isInspectorTestsEnabled, normalizeInspectorTab } from './state.js'

const props = defineProps<{
  /** Legacy URL tab value supplied by standalone routing adapter. */
  activeTab?: string
  /** Current documentation anchor supplied by standalone adapter. */
  docsAnchor?: string
  /** Explicit isolated-preview URL built by standalone adapter. */
  isolatedHref?: string
  /** Matrix layout may name local props selection without changing canonical variant. */
  variantTitle?: string
}>()
const emit = defineEmits<{ panel: [value: InspectorTab], close: [], error: [error: unknown] }>()
const { session, snapshot, story, variant } = useSelection()
const context = useHistoireContext()
const id = useId()
const tests = useProvidedHistoireTestsModel(session)
const projectTests = useWorkbenchTestsModel(session)
/** Project results are displayed only for exact selected target and current source. */
const testEntry = computed(() => {
  const target = snapshot.value.selection
  if (!target || snapshot.value.stale || snapshot.value.status !== 'ready') return undefined
  const entry = projectTests?.entries.value.get(getHistoireTargetKey(target))
  return entry?.stale && !entry.running ? undefined : entry
})
const cachedSummary = computed(() => testEntry.value?.running || testEntry.value?.stale || testEntry.value?.error ? undefined : testEntry.value?.summary ?? undefined)
const cachedCollection = computed(() => testEntry.value?.stale ? undefined : testEntry.value?.collection ?? undefined)
const cachedFailure = computed(() => {
  const error = testEntry.value?.error
  return error ? (error as Error).message ?? String(error) : undefined
})
const testsEnabled = computed(() => isInspectorTestsEnabled(__HISTOIRE_DEV__, snapshot.value.source?.mode))
const active = computed(() => normalizeInspectorTab(props.activeTab, testsEnabled.value))
const unseen = ref(0)
const counter = createInspectorEventCounter()
const events = computed(() => snapshot.value.events.items.filter(event => event.runtimeId === snapshot.value.runtime.runtimeId && event.target.storyId === snapshot.value.selection?.storyId && event.target.variantId === snapshot.value.selection?.variantId))
const testCount = computed(() => cachedSummary.value?.total ?? cachedCollection.value?.definitions.length ?? tests?.state.value.collection?.definitions.length ?? 0)
const testStatus = computed(() => {
  const value = tests?.state.value
  if (value?.status === 'running' || value?.status === 'collecting' || testEntry.value?.running) return 'running'
  const summary = cachedSummary.value ?? value?.summary
  if (summary) return summary.ok ? 'passed' : 'failed'
  if (value?.status === 'failed' || testEntry.value?.error) return 'failed'
  return 'idle'
})
watch([snapshot, active], () => unseen.value = counter.observe(snapshot.value, active.value === 'events'), { immediate: true, flush: 'sync' })
watch(() => context.panels.docs.value, intent => intent && emit('panel', 'docs'))

/** Explicit tab choice retires local search intent, while route mutation stays in host. */
function select(value: InspectorTab) {
  context.panels.clear()
  emit('panel', normalizeInspectorTab(value, testsEnabled.value))
}
</script>

<template>
  <section class="story-inspector" data-test-id="story-side-panel" aria-label="Story inspector">
    <InspectorHeader :story-title="story?.title || 'Story'" :variant-title="variantTitle || variant?.title" :isolated-href="isolatedHref" @close="emit('close')" />
    <InspectorTabs :id-prefix="id" :active-tab="active" :tests-enabled="testsEnabled" :event-count="unseen" :test-count="testCount" :test-status="testStatus" @select="select" />
    <div :id="`${id}-panel-${active || 'props'}`" class="inspector-content" data-histoire-docs-scroll role="tabpanel" :aria-labelledby="`${id}-tab-${active || 'props'}`">
      <PropsTab v-if="active === ''" @error="emit('error', $event)">
        <template v-if="$slots['matrix-props'] || $slots.matrix" #matrix>
          <slot name="matrix-props">
            <slot name="matrix" />
          </slot>
        </template>
      </PropsTab>
      <template v-else-if="active === 'docs'">
        <HistoireDocs v-if="story?.content.docs" :anchor="docsAnchor" @error="emit('error', $event)" />
        <p v-else class="inspector-empty">
          No documentation for this story.
        </p>
      </template>
      <template v-else-if="active === 'events'">
        <HistoireEvents inline-details />
        <p v-if="!events.length" class="inspector-empty">
          No events yet.
        </p>
      </template>
      <template v-else-if="testsEnabled && active === 'tests'">
        <p v-if="cachedFailure" class="inspector-test-failure" role="alert">
          {{ cachedFailure }}
        </p>
        <HistoireTests :summary="cachedSummary" :collection="cachedCollection" :running="testEntry?.running" @error="emit('error', $event)" />
      </template>
    </div>
    <SourceDrawer @error="emit('error', $event)" />
  </section>
</template>

<style scoped>
.story-inspector { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; color: var(--histoire-text); background: var(--histoire-surface); }
.inspector-content { flex: 1; min-height: 0; overflow: auto; }
.inspector-empty { margin: 24px 16px; color: var(--histoire-muted); font-size: 12px; }
.inspector-test-failure { margin: 0 16px 14px; color: var(--histoire-danger-text); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.inspector-content :deep(.histoire-docs) { padding: 2px 16px 20px; color: var(--histoire-body); font-size: 12px; line-height: 1.7; }
.inspector-content :deep(.histoire-docs :is(h1,h2,h3,h4)) { color: var(--histoire-text); font-weight: 800; }
.inspector-content :deep(.histoire-docs table) { width: 100%; font-size: 11px; border-collapse: collapse; }
.inspector-content :deep(.histoire-docs :is(th,td)) { padding: 9px; text-align: left; border-bottom: 1px solid var(--histoire-border); }
.inspector-content :deep(.histoire-events) { position: relative; padding: 2px 16px 16px; }
.inspector-content :deep(.histoire-events-count) { position: absolute; top: 9px; left: 16px; color: var(--histoire-muted); font-size: 10px; }
.inspector-content :deep(.histoire-events > button) { display: block; margin-left: auto; border: 0; border-radius: 7px; background: var(--histoire-chip); padding: 7px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
.inspector-content :deep(.histoire-events ol) { padding: 0; list-style: none; }
.inspector-content :deep(.histoire-event-row) { padding: 10px; border-radius: 8px; background: var(--histoire-chip); font: 11px var(--histoire-font-mono); }
.inspector-content :deep(.histoire-events li button) { display: flex; gap: 8px; width: 100%; border: 0; padding: 0; text-align: left; background: transparent; cursor: pointer; }
.inspector-content :deep(.histoire-events time) { margin-left: auto; color: var(--histoire-muted); font-size: 10px; }
.inspector-content :deep(.histoire-event-argument) { margin: 8px 0 0; max-height: 120px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--histoire-muted); font: 10px/1.6 var(--histoire-font-mono); }
.inspector-content :deep(.histoire-tests) { padding: 2px 16px 16px; font-size: 12px; }
.inspector-content :deep(.histoire-tests-actions button) { border-color: var(--histoire-border); background: var(--histoire-chip); border-radius: 7px; font-size: 11px; }
.inspector-content :deep(.histoire-test-row) { padding: 10px 0; border-bottom: 1px solid var(--histoire-border); }
.inspector-content :deep(.histoire-tests :is(pre,summary)) { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 var(--histoire-font-mono); }
</style>
