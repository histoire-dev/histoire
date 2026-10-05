<script setup lang="ts">
import type { HistoireSelectionInput } from '@histoire/protocol'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { useWorkbenchTestsModel } from '../../panes/tests/model.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

defineEmits<{
  /** Activate exact collected story/variant related to issue. */
  select: [target: HistoireSelectionInput]
}>()
const snapshot = useHistoireSnapshot()
const tests = useWorkbenchTestsModel()
const issues = computed(() => {
  const rows = tests?.rows.value.filter(row => !row.stale && (row.failed || row.notCollected)) ?? []
  const reported = new Set(rows.filter(row => row.notCollected).map(row => row.target.storyId))
  const reportedDiagnostics = new Set(rows.filter(row => row.key.startsWith('diagnostic:')).map(row => String(row.error)))
  const diagnostics = snapshot.value.catalog.diagnostics.filter(issue => issue.severity === 'warning' || (!reportedDiagnostics.has(issue.message) && (!issue.storyId || !reported.has(issue.storyId))))
  return [
    ...rows.map(row => ({ id: row.key, title: `${row.storyTitle}${row.variantTitle ? ` › ${row.variantTitle}` : ''}${row.notCollected ? ' failed to collect' : ' — failing tests'}`, message: row.error ? String((row.error as Error).message ?? row.error) : row.summary?.tests.filter(test => test.state === 'failed').map(test => test.fullName).join(', ') ?? '', warning: false, target: row.selectable ? row.target : undefined })),
    ...diagnostics.map((issue, index) => ({ id: `diagnostic:${index}`, title: issue.code, message: [issue.relativePath, issue.message].filter(Boolean).join(' — '), warning: issue.severity === 'warning', target: issue.storyId && snapshot.value.catalog.stories.some(story => story.id === issue.storyId) ? { storyId: issue.storyId } : undefined })),
  ]
})
</script>

<template>
  <section v-if="issues.length" class="histoire-needs-attention">
    <h2>Needs attention <span>{{ issues.length }}</span><small>DEV</small></h2>
    <div class="histoire-attention-card">
      <div v-for="issue in issues" :key="issue.id" class="histoire-attention-row">
        <WorkbenchIcon :name="issue.warning ? 'warning-alt-filled' : 'error-filled'" :class="issue.warning ? 'warning' : 'danger'" />
        <div><strong>{{ issue.title }}</strong><p>{{ issue.message }}</p></div>
        <HstButton v-if="issue.target" color="flat" type="button" @click="$emit('select', issue.target)">
          <WorkbenchIcon name="launch" />View
        </HstButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 15px; font-weight: 800; }
h2 span, h2 small { color: var(--histoire-muted); font-size: 10px; }
h2 small { border-radius: 5px; padding: 2px 5px; background: var(--histoire-chip); }
.histoire-attention-card { overflow: hidden; border: 1px solid var(--histoire-border); border-radius: 14px; background: var(--histoire-surface); }
.histoire-attention-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.histoire-attention-row + .histoire-attention-row { border-top: 1px solid var(--histoire-border); }
.histoire-attention-row > div { flex: 1; min-width: 0; }
.histoire-attention-row p { overflow: hidden; margin: 3px 0 0; color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); text-overflow: ellipsis; white-space: nowrap; }
.histoire-attention-row button { display: flex; align-items: center; gap: 6px; padding: 6px 9px; color: var(--histoire-text); }
.danger { color: var(--histoire-danger); }
.warning { color: var(--histoire-warn); }
</style>
