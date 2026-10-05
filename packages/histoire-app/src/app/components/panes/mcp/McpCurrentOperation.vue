<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { isMcpOperationCancellable, mcpOperationProgress, mcpTargetLabel } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const store = useMcpStore()
const snapshot = useHistoireSnapshot()
const operation = computed(() => store.current)
const progress = computed(() => mcpOperationProgress(operation.value))
const cancelling = computed(() => operation.value && store.cancelling.includes(operation.value.id))
</script>

<template>
  <section v-if="operation" class="histoire-mcp-current" aria-label="Current MCP operation" aria-live="polite">
    <div class="histoire-mcp-operation-heading">
      <WorkbenchIcon name="time" />
      <code>{{ operation.tool }}</code>
      <span :title="mcpTargetLabel(operation.target, snapshot.catalog)">{{ mcpTargetLabel(operation.target, snapshot.catalog) }}</span>
      <HstButton v-if="isMcpOperationCancellable(operation)" color="flat" type="button" :disabled="cancelling" :aria-label="cancelling ? 'Cancelling operation' : 'Cancel operation'" @click="store.cancel(operation.id)">
        <WorkbenchIcon name="stop-filled" :size="14" />
      </HstButton>
    </div>
    <progress v-if="progress" :value="progress.done" :max="progress.total" aria-label="Operation progress" />
    <div class="histoire-mcp-operation-detail">
      <span v-if="cancelling">Cancelling · </span>
      <span v-else-if="progress">{{ progress.done }} of {{ progress.total }} · </span>
      <span v-else>{{ operation.state === 'queued' ? 'Queued' : 'Running' }} · </span>
      {{ store.clientName(operation.clientId) }}
    </div>
  </section>
</template>

<style scoped>
.histoire-mcp-current { margin-bottom: 16px; padding: 12px; border-radius: 12px; background: var(--histoire-agent-soft); }
.histoire-mcp-operation-heading { display: flex; align-items: center; gap: 7px; color: var(--histoire-agent-text); }
code { font-size: 11px; overflow-wrap: anywhere; }
.histoire-mcp-operation-heading > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--histoire-muted); }
button { display: grid; place-items: center; flex: none; width: 26px; height: 26px; color: var(--histoire-danger-text); }
button:hover { background: var(--histoire-danger-soft); }
button:disabled { opacity: .5; cursor: wait; }
progress { appearance: none; display: block; width: 100%; height: 4px; margin: 10px 0; border: 0; border-radius: 999px; background: var(--histoire-surface); overflow: hidden; }
progress::-webkit-progress-bar { background: var(--histoire-surface); border-radius: 999px; }
progress::-webkit-progress-value { background: var(--histoire-agent); border-radius: 999px; }
progress::-moz-progress-bar { background: var(--histoire-agent); border-radius: 999px; }
.histoire-mcp-operation-detail { margin-top: 8px; color: var(--histoire-muted); font-size: 11px; }
</style>
