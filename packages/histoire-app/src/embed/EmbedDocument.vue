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
    <HistoireEmbed :scope="options.variantId === undefined ? 'story' : 'variant'" :panels="options.panels" :padding="options.padding" @error="emit('error', $event)" />
  </HistoireProvider>
  <div v-else class="htw:flex htw:items-center htw:justify-center htw:size-full htw:[font-family:system-ui,sans-serif] htw:text-[var(--histoire-text,#18181b)]">
    <WorkbenchEmptyState v-if="error" icon="warning-alt" title="Unable to load embed">
      {{ error }}
    </WorkbenchEmptyState>
    <WorkbenchLoadingState v-else title="Loading variant" />
  </div>
</template>
