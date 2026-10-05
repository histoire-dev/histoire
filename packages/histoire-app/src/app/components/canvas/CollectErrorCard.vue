<script setup lang="ts">
import type { HistoireDiagnostic } from '@histoire/sdk'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'

defineProps<{
  /** Completed collection diagnostics for current story. */
  errors: readonly HistoireDiagnostic[]
}>()
</script>

<template>
  <section class="histoire-collect-errors" role="alert">
    <WorkbenchIcon name="error-filled" :size="18" />
    <div>
      <strong>Story collection failed</strong><div v-for="(error, index) in errors" :key="index">
        <code v-if="error.relativePath">{{ error.relativePath }}</code><p>{{ error.message }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.histoire-collect-errors { position: absolute; left: 36px; bottom: 54px; display: flex; align-items: flex-start; gap: 12px; max-width: min(560px, calc(100% - 72px)); max-height: 35%; overflow: auto; padding: 16px; border: 1px solid var(--histoire-danger); border-radius: 12px; background: var(--histoire-danger-soft); color: var(--histoire-danger); font-size: 13px; }
strong { display: block; margin-bottom: 8px; } code { font-family: var(--histoire-font-mono, "JetBrains Mono", monospace); font-size: 11px; } p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
