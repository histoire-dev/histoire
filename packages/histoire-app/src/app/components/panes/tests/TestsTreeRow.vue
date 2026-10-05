<script setup lang="ts">
import type { WorkbenchTestRow } from './types.js'
import { HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

/** One actual collected variant or diagnostic; unknown diagnostics stay visible. */
const props = defineProps<{ row: WorkbenchTestRow, selected: boolean }>()
const emit = defineEmits<{ select: [row: WorkbenchTestRow] }>()
const icon = computed(() => props.row.notCollected ? 'warning-alt-filled' : props.row.running ? 'in-progress' : props.row.stale ? 'renew' : props.row.failed ? 'error-filled' : props.row.summary?.passed ? 'checkmark-filled' : 'subtract')
const status = computed(() => props.row.notCollected ? 'not collected' : props.row.stale ? 'outdated' : props.row.running ? 'running' : props.row.failed ? 'tests failing' : props.row.summary ? 'tests completed' : 'not run')
</script>

<template>
  <HstButton color="flat" type="button" class="test-row" :class="{ failed: row.failed, warning: row.notCollected, passed: !row.failed && row.summary?.passed }" :aria-current="selected ? 'true' : undefined" :aria-label="`${row.storyTitle} / ${row.variantTitle ?? status}, ${status}`" :disabled="!row.selectable" :title="row.error ? String(row.error) : undefined" @click="emit('select', row)">
    <WorkbenchIcon :name="icon" />
    <span class="test-row-title">{{ row.variantTitle ?? row.storyTitle }}</span>
    <span v-if="row.notCollected" class="test-row-detail">not collected</span>
    <span v-else-if="row.stale" class="test-row-detail">outdated</span>
    <span v-else-if="row.duration !== null" class="test-row-detail">{{ Math.round(row.duration) }}ms</span>
  </HstButton>
</template>

<style scoped>
.test-row { display: flex; align-items: center; gap: 8px; width: 100%; height: var(--histoire-virtual-row-height, 39px); padding: var(--histoire-test-row-padding, 9px) 10px var(--histoire-test-row-padding, 9px) 42px; color: var(--histoire-text); line-height: 18px; text-align: left; }
.test-row:hover, .test-row[aria-current='true'] { background: var(--histoire-accent-soft); }
.test-row:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
.test-row:disabled { opacity: 1; cursor: default; }
.test-row-title { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.test-row-detail { color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 11px; white-space: nowrap; }
.failed :deep(svg) { color: var(--histoire-danger); }
.warning :deep(svg) { color: var(--histoire-warn); }
.passed :deep(svg) { color: var(--histoire-accent); }
</style>
