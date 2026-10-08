<script setup lang="ts">
import type { HistoireEmbedDocumentOptions } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import { HistoireEmbed, HistoireProvider } from '@histoire/vue'
import WorkbenchEmptyState from '../app/components/shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../app/components/shell/WorkbenchLoadingState.vue'

defineProps<{
  /** Connected document-owned session, absent during metadata acquisition. */
  session?: HistoireSession
  /** Validated public target and panels. */
  options?: HistoireEmbedDocumentOptions
  /** Current live acquisition or runtime failure. */
  error?: string
}>()
const emit = defineEmits<{ error: [error: unknown] }>()
</script>

<template>
  <HistoireProvider v-if="session && options && !error" :session="session" @error="emit('error', $event)">
    <HistoireEmbed :scope="options.variantId === undefined ? 'story' : 'variant'" :panels="options.panels" @error="emit('error', $event)" />
  </HistoireProvider>
  <div v-else class="embed-document-state">
    <WorkbenchEmptyState v-if="error" icon="warning-alt" title="Unable to load embed">
      {{ error }}
    </WorkbenchEmptyState>
    <WorkbenchLoadingState v-else title="Loading variant" />
  </div>
</template>

<style scoped>
.embed-document-state { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-family: system-ui, sans-serif; color: var(--histoire-text, #18181b); }
</style>
