<script setup lang="ts">
withDefaults(defineProps<{
  /** Accessible status; decorative shapes never expose invented field names. */
  label?: string
  /** Number of label-and-field placeholders matching expected content density. */
  rows?: number
}>(), { label: 'Loading', rows: 3 })
</script>

<template>
  <div class="workbench-loading-skeleton" role="status" :aria-label="label" aria-busy="true">
    <div v-for="row in rows" :key="row" class="skeleton-row" aria-hidden="true">
      <div class="skeleton-label" />
      <div class="skeleton-field" />
    </div>
  </div>
</template>

<style scoped>
.workbench-loading-skeleton { display: grid; gap: 24px; padding: 2px var(--histoire-control-wrapper-padding, 8px) 16px; }
.skeleton-row { display: grid; gap: 12px; }
.skeleton-label, .skeleton-field { background: var(--histoire-chip); animation: skeleton-pulse 1.4s ease-in-out infinite; }
.skeleton-label { width: 30%; height: 12px; border-radius: 4px; }
.skeleton-field { width: 100%; height: var(--histoire-control-height, 34px); border-radius: 7px; }
@keyframes skeleton-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .skeleton-label, .skeleton-field { animation: none; } }
</style>
