<script setup lang="ts">
import type { UiVisualResult } from '@histoire/shared'
import type { VisualFilter } from './projection.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, ref } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import { projectVisualRows } from './projection.js'
import VisualResultRow from './VisualResultRow.vue'

/** Story-grouped virtual results; `canApprove` decides which rows get a checkbox. */
const props = defineProps<{ filter: VisualFilter, canApprove: (result: UiVisualResult) => boolean }>()
const model = useWorkbenchVisual()!
const snapshot = useHistoireSnapshot()
const closed = ref(new Set<string>())
const titles = computed(() => new Map(snapshot.value.catalog.stories.map(story => [story.id, story.title])))
const entries = computed(() => projectVisualRows(model.results.value, id => titles.value.get(id) ?? id, props.filter, closed.value))
/** Reserve checkbox column only when at least one visible row can be approved, keeping rows aligned. */
const selectable = computed(() => entries.value.some(entry => entry.kind === 'result' && props.canApprove(entry.result)))

/** Disclosure changes only local list presentation. */
function toggle(storyId: string): void {
  const next = new Set(closed.value)
  if (!next.delete(storyId)) next.add(storyId)
  closed.value = next
}
</script>

<template>
  <div class="visual-results">
    <WorkbenchVirtualList :items="entries" :item-size="40" list-tag="ul" item-tag="li">
      <template #default="{ item }">
        <HstButton v-if="item.kind === 'heading'" color="flat" type="button" class="visual-story" :aria-expanded="!closed.has(item.storyId)" @click="toggle(item.storyId)">
          <BuiltinIcon :icon="closed.has(item.storyId) ? 'chevron-right' : 'chevron-down'" :size="16" />
          <strong>{{ item.title }}</strong>
          <span :title="`${item.passed} of ${item.total} passed`">{{ item.passed }} / {{ item.total }}</span>
        </HstButton>
        <VisualResultRow v-else-if="item.kind === 'result'" :result="item.result" :label="item.label" :approvable="canApprove(item.result)" :selectable="selectable" />
      </template>
    </WorkbenchVirtualList>
  </div>
</template>

<style scoped>
.visual-results { flex: 1; min-height: 0; overflow: hidden; padding: 0 calc(var(--histoire-pane-gutter, 16px) - 8px) 8px; }
.visual-story { display: flex; align-items: center; gap: 8px; width: 100%; height: var(--histoire-virtual-row-height, 39px); padding: 10px 8px; color: var(--histoire-text); line-height: 18px; text-align: left; }
.visual-story:hover { background: var(--histoire-chip); }
.visual-story:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
.visual-story > svg { flex: none; color: var(--histoire-muted); }
.visual-story strong { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 750; }
.visual-story span { font-size: 11px; font-family: var(--histoire-font-mono); color: var(--histoire-muted); }
</style>
