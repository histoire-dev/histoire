<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { WorkbenchTestRow } from './types.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import TestsTreeRow from './TestsTreeRow.vue'

/** Catalog rows remain ordered by source, grouped by exact story identity. */
const props = defineProps<{ rows: readonly WorkbenchTestRow[], filter: 'failing' | 'all' | 'changed', selected: HistoireTarget | null }>()
const emit = defineEmits<{ select: [row: WorkbenchTestRow] }>()
/** One fixed-height row in the flattened virtual project explorer. */
type TestTreeEntry =
  | { key: string, kind: 'heading', id: string, title: string, failed: boolean, stale: boolean, passed: boolean, count: number, total: number }
  | { key: string, kind: 'test', row: WorkbenchTestRow }
const closed = ref(new Set<string>())
const visible = computed<TestTreeEntry[]>(() => {
  const groups = new Map<string, WorkbenchTestRow[]>()
  for (const row of props.rows) {
    const group = groups.get(row.target.storyId)
    if (group) group.push(row)
    else groups.set(row.target.storyId, [row])
  }
  const entries: TestTreeEntry[] = []
  for (const [id, all] of groups) {
    const rows = all.filter(row => props.filter === 'all' || (props.filter === 'changed' ? row.stale : row.failed))
    if (!rows.length) continue
    const hasDisclosure = !all.every(row => row.notCollected)
    if (hasDisclosure) {
      entries.push({
        key: JSON.stringify(['heading', id]),
        kind: 'heading',
        id,
        title: all[0].storyTitle,
        failed: all.some(row => row.failed),
        stale: all.some(row => row.stale),
        passed: all.every(row => row.summary?.ok && !row.stale) && all.some(row => row.summary?.passed),
        count: all.reduce((sum, row) => sum + (row.summary?.passed ?? 0), 0),
        total: all.reduce((sum, row) => sum + (row.collection?.definitions.length ?? row.summary?.total ?? 0), 0),
      })
    }
    // Collection-only groups have no heading, so retained collapse state cannot hide recovery diagnostics.
    if (!hasDisclosure || !closed.value.has(id)) entries.push(...rows.map(row => ({ key: row.key, kind: 'test' as const, row })))
  }
  return entries
})
/** Folder disclosure changes only local project explorer presentation. */
function toggle(storyId: string) {
  const next = new Set(closed.value)
  if (!next.delete(storyId)) next.add(storyId)
  closed.value = next
}
</script>

<template>
  <div class="tests-tree" aria-label="Project tests">
    <p v-if="!visible.length" class="tests-empty">
      {{ !rows.length ? 'No tests' : filter === 'failing' ? 'No failing tests' : filter === 'changed' ? 'No outdated results' : 'No tests' }}
    </p>
    <WorkbenchVirtualList v-else :items="visible" :item-size="40" list-tag="ul" item-tag="li">
      <template #default="{ item }">
        <HstButton v-if="item.kind === 'heading'" color="flat" type="button" class="test-story-heading" :aria-expanded="!closed.has(item.id)" @click="toggle(item.id)">
          <WorkbenchIcon :name="closed.has(item.id) ? 'chevron-right' : 'chevron-down'" />
          <WorkbenchIcon :name="item.failed ? 'error-filled' : item.stale ? 'renew' : item.passed ? 'checkmark-filled' : 'subtract'" :class="{ failed: item.failed, passed: item.passed }" />
          <strong>{{ item.title }}</strong>
          <span>{{ item.count }} / {{ item.total }}</span>
        </HstButton>
        <TestsTreeRow v-else :row="item.row" :selected="selected?.storyId === item.row.target.storyId && selected?.variantId === item.row.target.variantId" @select="emit('select', $event)" />
      </template>
    </WorkbenchVirtualList>
  </div>
</template>

<style scoped>
.tests-tree { flex: 1; min-height: 0; overflow: hidden; padding: 0 8px 12px; }
.tests-empty { padding: 20px 8px; color: var(--histoire-muted); }
.test-story-heading { display: flex; align-items: center; gap: 8px; width: 100%; height: var(--histoire-virtual-row-height, 39px); padding: var(--histoire-test-heading-padding, 10px) 8px; color: var(--histoire-text); line-height: 18px; text-align: left; }
.test-story-heading strong { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 750; }
.test-story-heading span { font-size: 11px; font-family: var(--histoire-font-mono); color: var(--histoire-muted); }
.test-story-heading:hover { background: var(--histoire-chip); }
.test-story-heading:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
.failed { color: var(--histoire-danger); }
.passed { color: var(--histoire-accent); }
</style>
