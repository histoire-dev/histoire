<script setup lang="ts">
import type { WorkbenchTestsSummary } from './types.js'
import { computed } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

/** Current assertion totals and explicit batch progress. */
const props = defineProps<{ summary: WorkbenchTestsSummary, running: boolean, completed: number, total: number }>()
const count = computed(() => props.summary.passed + props.summary.failed + props.summary.skipped)
const duration = computed(() => `${(props.summary.duration / 1000).toFixed(1)}s`)
</script>

<template>
  <section class="test-summary" aria-label="Project test summary">
    <div class="test-summary-bar" role="progressbar" :aria-label="running ? 'Test run progress' : 'Completed tests'" :aria-valuemin="0" :aria-valuemax="running ? total : count" :aria-valuenow="running ? completed : count">
      <template v-if="count">
        <span class="passed" :style="{ flexGrow: summary.passed }" />
        <span class="failed" :style="{ flexGrow: summary.failed }" />
        <span class="skipped" :style="{ flexGrow: summary.skipped }" />
      </template>
      <span v-else class="empty" />
    </div>
    <output class="test-summary-counts" aria-live="polite">
      <span class="passed" :aria-label="`${summary.passed} passed`"><WorkbenchIcon name="checkmark-filled" />{{ summary.passed }}</span>
      <span class="failed" :aria-label="`${summary.failed} failed`"><WorkbenchIcon name="error-filled" />{{ summary.failed }}</span>
      <span class="skipped" :aria-label="`${summary.skipped} skipped`"><WorkbenchIcon name="subtract" />{{ summary.skipped }}</span>
      <span class="duration">{{ running ? `${completed}/${total}` : duration }}</span>
    </output>
    <p v-if="summary.stale || summary.notCollected" class="test-summary-extra">
      <span v-if="summary.stale">{{ summary.stale }} outdated</span>
      <span v-if="summary.notCollected">{{ summary.notCollected }} not collected</span>
    </p>
  </section>
</template>

<style scoped>
.test-summary { padding: 0 16px; }
.test-summary-bar { display: flex; gap: 2px; height: 6px; overflow: hidden; border-radius: 4px; background: var(--histoire-chip); }
.test-summary-bar span { min-width: 0; }
.test-summary-bar .passed { background: var(--histoire-accent); }
.test-summary-bar .failed { background: var(--histoire-danger); }
.test-summary-bar .skipped { background: var(--histoire-chip); }
.test-summary-counts { display: flex; gap: 13px; align-items: center; padding: 12px 0 3px; font-variant-numeric: tabular-nums; }
.test-summary-counts span { display: inline-flex; align-items: center; gap: 5px; font-weight: 750; }
.test-summary-counts .passed { color: var(--histoire-accent-link); }
.test-summary-counts .failed { color: var(--histoire-danger-text); }
.test-summary-counts .skipped, .duration { color: var(--histoire-muted); }
.test-summary-counts .duration { margin-left: auto; font-weight: 500; }
.test-summary-extra { display: flex; gap: 12px; margin: 6px 0 0; color: var(--histoire-muted); font-size: 11px; }
</style>
