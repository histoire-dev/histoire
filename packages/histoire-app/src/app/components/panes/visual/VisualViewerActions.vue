<script setup lang="ts">
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'

defineProps<{
  /** Capture failure owns its Run again action in the board. */
  captureFailed: boolean
}>()
const emit = defineEmits<{
  /** Approve after moving focus to dialog. */
  approve: []
  /** Rerun after moving focus to dialog. */
  rerun: []
}>()
const model = useWorkbenchVisual()!
const result = model.selectedResult
const pending = computed(() => !!result.value && model.approvalPending(result.value))
/** Preserve review eligibility; keep pending action visible until receipt settles. */
const approvable = computed(() => !!result.value && !result.value.staleReason && !!result.value.reviewHandle && !model.busy(result.value) && !result.value.approved && !!result.value.currentHash && ['changed', 'missing', 'incompatible'].includes(result.value.status))
</script>

<template>
  <div class="viewer-actions">
    <p v-if="model.issue.value" class="issue viewer-float" role="alert">
      {{ model.issue.value }}
    </p>
    <div class="buttons">
      <HstButton v-if="!captureFailed" class="viewer-float" :disabled="!!model.requestId.value || pending" @click="emit('rerun')">
        <BuiltinIcon icon="renew" :size="14" />Run again
      </HstButton>
      <HstButton v-if="approvable" color="primary" :disabled="model.approving.value" @click="emit('approve')">
        <HstPulsatingDisc v-if="pending" :size="12" />
        <BuiltinIcon v-else icon="checkmark" :size="14" />
        {{ pending ? 'Saving baseline' : result?.status === 'missing' ? 'Create baseline' : 'Approve baseline' }}
      </HstButton>
    </div>
  </div>
</template>

<style scoped>
.viewer-actions { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; }.buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }.buttons :deep(button) { min-height: 36px; border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.issue { --viewer-float-background: var(--histoire-danger-soft); width: max-content; max-width: min(400px, 100%); max-height: 100px; overflow: auto; margin: 0; padding: 8px 12px; color: var(--histoire-danger-text); font-size: 12px; white-space: pre-line; overflow-wrap: anywhere; }
@container (max-width: 640px) { .viewer-actions { align-items: center; }.buttons { justify-content: center; } }
</style>
