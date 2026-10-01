<script lang="ts" setup>
import type { HistoireSerializedTestError, HistoireTestError } from '@histoire/shared'
import { formatTestError } from '@histoire/shared'

const props = defineProps<{
  error: HistoireTestError
}>()

/**
 * Returns the summary text shown for an error row.
 */
function getSummaryLabel(error: HistoireTestError) {
  return typeof error === 'string' ? error : error.message
}

/**
 * Narrows an error payload to the serialized error shape.
 */
function isSerializedError(error: HistoireTestError): error is HistoireSerializedTestError {
  return error !== null && typeof error === 'object'
}

/**
 * Formats the raw error payload for display in the nested details block.
 */
function formatRawError(error: HistoireSerializedTestError) {
  if (error.raw === undefined) {
    return ''
  }
  if (typeof error.raw === 'string') {
    return error.raw
  }
  try {
    return JSON.stringify(error.raw, null, 2)
  }
  catch {
    return String(error.raw)
  }
}
</script>

<template>
  <details class="htw-rounded htw-border htw-border-gray-100 dark:htw-border-gray-750 htw-bg-gray-50 dark:htw-bg-gray-800">
    <summary class="htw-p-2 htw-text-xs htw-font-medium htw-cursor-pointer">
      {{ getSummaryLabel(props.error) }}
    </summary>

    <div class="htw-p-2 htw-space-y-2 htw-text-xs htw-border-t htw-border-gray-500/10 htw-overflow-y-auto htw-overflow-x-hidden htw-max-h-[300px]">
      <pre class="htw-whitespace-pre-wrap htw-break-all">{{ formatTestError(props.error) }}</pre>

      <details
        v-if="isSerializedError(props.error) && props.error.raw !== undefined"
        class="htw-space-y-2"
      >
        <summary class="htw-text-xs htw-font-medium htw-underline htw-cursor-pointer">
          Raw error
        </summary>
        <pre class="htw-whitespace-pre-wrap htw-break-all">{{ formatRawError(props.error) }}</pre>
      </details>
    </div>
  </details>
</template>
