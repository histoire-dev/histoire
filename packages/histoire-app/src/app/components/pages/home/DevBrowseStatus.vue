<script setup lang="ts">
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useWorkbenchTestsModel } from '../../panes/tests/model.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const props = defineProps<{
  /** Exact identities of stories in this section. */
  storyIds: string[]
}>()
const tests = useWorkbenchTestsModel()
const snapshot = useHistoireSnapshot()
const status = computed(() => {
  const ids = new Set(props.storyIds)
  const rows = tests?.rows.value.filter(row => ids.has(row.target.storyId)) ?? []
  if (rows.some(row => !row.stale && (row.failed || row.notCollected))) return { name: 'error-filled', label: 'Failing tests', color: 'var(--histoire-danger)' }
  if (snapshot.value.catalog.diagnostics.some(issue => issue.storyId && ids.has(issue.storyId))) return { name: 'warning-alt-filled', label: 'Collection warning', color: 'var(--histoire-warn)' }
  if (rows.length && rows.every(row => !row.stale && row.summary?.ok)) return { name: 'checkmark-filled', label: 'Tests passed', color: 'var(--histoire-accent)' }
  return null
})
</script>

<template>
  <span v-if="status" :aria-label="status.label" :title="status.label" :style="{ color: status.color }"><WorkbenchIcon :name="status.name" :size="13" /></span>
</template>
