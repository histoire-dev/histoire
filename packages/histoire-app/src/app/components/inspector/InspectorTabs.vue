<script setup lang="ts">
import type { InspectorTab } from './state.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import { getInspectorTabs } from './state.js'

const props = defineProps<{
  /** Current legacy URL tab value. */
  activeTab: InspectorTab
  /** Standalone host hides Tests when build or connected source is static. */
  testsEnabled: boolean
  /** Inspector-local IDs keep accessibility links within this mounted workbench. */
  idPrefix: string
  /** Current selected document's unseen event count. */
  eventCount: number
  /** Current shared test collection size. */
  testCount: number
  /** Actual collected/run state; absence never implies a pass. */
  testStatus: 'idle' | 'running' | 'passed' | 'failed'
}>()
const emit = defineEmits<{ select: [value: InspectorTab] }>()
const root = ref<HTMLElement>()
/** Ordered route registry also owns keyboard navigation. */
const tabs = computed(() => getInspectorTabs(props.testsEnabled))

/** Arrow/Home/End navigation moves focus and selection together. */
function navigate(event: KeyboardEvent) {
  const current = tabs.value.findIndex(tab => tab.value === props.activeTab)
  const index = event.key === 'ArrowRight' ? (current + 1) % tabs.value.length : event.key === 'ArrowLeft' ? (current + tabs.value.length - 1) % tabs.value.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.value.length - 1 : -1
  if (index < 0) return
  event.preventDefault()
  emit('select', tabs.value[index].value)
  root.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
}
</script>

<template>
  <div ref="root" class="inspector-tabs histoire-button-group-options" role="tablist" aria-label="Inspector" @keydown="navigate">
    <HstButton v-for="tab in tabs" :id="`${idPrefix}-tab-${tab.value || 'props'}`" :key="tab.value" color="flat" type="button" role="tab" :aria-selected="activeTab === tab.value" :aria-controls="`${idPrefix}-panel-${tab.value || 'props'}`" :tabindex="activeTab === tab.value ? 0 : -1" :data-test-id="tab.value === 'tests' ? 'story-tests-tab' : undefined" @click="emit('select', tab.value)">
      {{ tab.label }}
      <span v-if="tab.value === 'events' && eventCount" class="inspector-event-count" :aria-label="`${eventCount} unseen events`">{{ eventCount }}</span>
      <span v-if="tab.value === 'tests' && testStatus !== 'idle'" :class="`inspector-test-${testStatus}`" role="img" :aria-label="`Tests ${testStatus}`">
        <WorkbenchIcon :name="testStatus === 'passed' ? 'checkmark' : testStatus === 'failed' ? 'close' : 'in-progress'" :size="12" />
      </span>
      <span v-else-if="tab.value === 'tests' && testCount" class="inspector-test-count" :aria-label="`${testCount} collected tests`">{{ testCount }}</span>
    </HstButton>
  </div>
</template>

<style scoped>
.inspector-tabs { margin: 0 12px 14px; }
.inspector-tabs button { display: flex; align-items: center; justify-content: center; gap: 5px; flex: 1; min-width: 0; min-height: 32px; color: var(--histoire-muted); font-weight: 700; }
.inspector-tabs button:hover { color: var(--histoire-text); }
.inspector-event-count { color: var(--histoire-agent-text); font-size: 13px; font-variant-numeric: tabular-nums; }
.inspector-test-passed { color: var(--histoire-accent); }
.inspector-test-failed { color: var(--histoire-danger); }
.inspector-test-count { color: var(--histoire-muted); font-size: 13px; }
</style>
