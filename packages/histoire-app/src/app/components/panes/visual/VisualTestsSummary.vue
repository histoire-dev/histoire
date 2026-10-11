<script setup lang="ts">
import type { VisualCounts } from './projection.js'
import { BuiltinIcon } from '@histoire/controls/vue'
import { computed } from 'vue'
import { VISUAL_ISSUE_STATUSES } from './projection.js'
import { VISUAL_STATUS } from './status.js'

/** Run totals with explicit progress while comparisons are pending. */
const props = defineProps<{ counts: VisualCounts, running: boolean, completed: number, total: number, stale: boolean }>()
/** Only outcomes that actually occurred, so idle statuses do not crowd narrow panes. */
const issues = computed(() => VISUAL_ISSUE_STATUSES.filter(status => props.counts[status]))
const done = computed(() => props.counts.passed + issues.value.reduce((sum, status) => sum + props.counts[status], 0))
</script>

<template>
  <section class="visual-summary" aria-label="Visual run summary">
    <div class="visual-summary-bar" role="progressbar" :aria-label="running ? 'Visual run progress' : 'Compared images'" :aria-valuemin="0" :aria-valuemax="total" :aria-valuenow="running ? completed : done">
      <span v-if="running" class="progress" :style="{ width: `${total ? completed / total * 100 : 0}%` }" />
      <template v-else>
        <span class="passed" :style="{ flexGrow: counts.passed }" />
        <span v-for="status in issues" :key="status" :data-tone="VISUAL_STATUS[status].tone" :style="{ flexGrow: counts[status] }" />
      </template>
    </div>
    <output v-if="running" class="visual-summary-progress" role="status" aria-live="polite" aria-atomic="true">
      Comparing images…{{ total ? ` ${completed} of ${total}` : '' }}
    </output>
    <output v-else class="visual-summary-counts" role="status" aria-live="polite">
      <span class="count" :data-tone="counts.passed ? 'passed' : 'muted'"><BuiltinIcon icon="checkmark-filled" :size="16" />{{ counts.passed }} passed</span>
      <span v-for="status in issues" :key="status" class="count" :data-tone="VISUAL_STATUS[status].tone"><BuiltinIcon :icon="VISUAL_STATUS[status].icon" :size="16" />{{ counts[status] }} {{ VISUAL_STATUS[status].label.toLowerCase() }}</span>
      <span class="progress-label">{{ done }}/{{ total }}</span>
    </output>
    <p v-if="stale && !running" class="visual-summary-stale">
      <BuiltinIcon icon="renew" :size="14" />Source changed, run again to approve
    </p>
  </section>
</template>

<style scoped>
.visual-summary { padding: 0 var(--histoire-pane-gutter, 16px) 4px; }
.visual-summary-bar { display: flex; gap: 2px; height: 6px; overflow: hidden; border-radius: 4px; background: var(--histoire-chip); }
.visual-summary-bar span { min-width: 0; }
.visual-summary-bar .progress { background: var(--histoire-accent); transition: width .2s; }
.visual-summary-bar .passed { background: var(--histoire-accent); }
.visual-summary-bar [data-tone=danger] { background: var(--histoire-danger); }
.visual-summary-bar [data-tone=warn] { background: var(--histoire-warn); }
.visual-summary-bar [data-tone=muted] { background: var(--histoire-muted); }
.visual-summary-counts { display: flex; flex-wrap: wrap; gap: 6px 13px; align-items: center; padding: 12px 0 3px; font-variant-numeric: tabular-nums; }
.count { display: inline-flex; align-items: center; gap: 5px; font-weight: 750; white-space: nowrap; }
.count[data-tone=passed] { color: var(--histoire-accent-link); }
.count[data-tone=danger] { color: var(--histoire-danger-text); }
.count[data-tone=warn] { color: var(--histoire-warn); }
.count[data-tone=muted], .progress-label { color: var(--histoire-muted); }
.progress-label { margin-left: auto; font-weight: 500; }
.visual-summary-progress { display: block; margin: 6px 0 0; color: var(--histoire-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.visual-summary-stale { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; color: var(--histoire-warn); font-size: 11px; }
</style>
