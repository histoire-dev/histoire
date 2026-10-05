<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { isMcpOperationCancellable, mcpOperationIcon, mcpOperationProgress, mcpTargetLabel, mcpTimeAgo } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

defineEmits<{
  /** Focus shared MCP pane without changing route or Follow preference. */
  open: []
}>()
const store = useMcpStore()
const snapshot = useHistoireSnapshot()
const current = computed(() => store.current)
const cancellable = computed(() => current.value && isMcpOperationCancellable(current.value))
const progress = computed(() => mcpOperationProgress(current.value))
const recent = computed(() => store.history.slice(0, 3))
</script>

<template>
  <section v-if="store.status === 'enabled'" class="histoire-mcp-activity" aria-label="Agent activity">
    <h2>
      <HstButton color="flat" type="button" @click="$emit('open')">
        Agent activity
      </HstButton><small>DEV</small>
    </h2>
    <div class="histoire-mcp-activity-card">
      <div v-if="current" class="histoire-mcp-activity-current" aria-live="polite">
        <div>
          <WorkbenchIcon name="bot" />
          <strong :title="store.clientName(current.clientId)">{{ store.clientName(current.clientId) }}</strong>
          <code :title="current.tool">{{ current.tool }}</code>
          <span v-if="progress">{{ progress.done }} / {{ progress.total }}</span>
          <HstButton v-if="cancellable" color="flat" type="button" :disabled="store.cancelling.includes(current.id)" aria-label="Cancel operation" @click="store.cancel(current.id)">
            <WorkbenchIcon name="stop-filled" :size="12" />
          </HstButton>
        </div>
        <progress v-if="progress" :value="progress.done" :max="progress.total" aria-label="Operation progress" />
      </div>
      <ul v-if="recent.length">
        <li v-for="operation in recent" :key="operation.id" :data-state="operation.state">
          <span class="histoire-mcp-activity-status" :aria-label="operation.state"><WorkbenchIcon :name="mcpOperationIcon(operation)" :size="13" /></span>
          <code :title="operation.tool">{{ operation.tool }}</code>
          <span class="histoire-mcp-activity-target" :title="mcpTargetLabel(operation.target, snapshot.catalog)">{{ mcpTargetLabel(operation.target, snapshot.catalog) || store.clientName(operation.clientId) }}</span>
          <time :datetime="operation.endedAt ?? operation.startedAt">{{ mcpTimeAgo(operation.endedAt ?? operation.startedAt, store.now) }}</time>
        </li>
      </ul>
      <p v-if="!current && !recent.length" class="histoire-mcp-activity-empty">
        {{ store.clients.length ? `${store.clients.length} client${store.clients.length === 1 ? '' : 's'} connected.` : 'No tool calls yet.' }}
      </p>
      <p v-if="store.error" class="histoire-mcp-activity-error" role="alert">
        {{ store.error }}
      </p>
    </div>
  </section>
</template>

<style scoped>
h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 15px; font-weight: 800; }
h2 button { padding: 0; color: inherit; }
h2 button:hover { color: var(--histoire-accent-link); }
h2 small { color: var(--histoire-muted); font-size: 10px; border-radius: 5px; padding: 2px 5px; background: var(--histoire-chip); }
.histoire-mcp-activity-card { padding: 12px; border: 1px solid var(--histoire-border); border-radius: 14px; background: var(--histoire-surface); }
.histoire-mcp-activity-current { padding: 10px; margin-bottom: 8px; border-radius: 10px; background: var(--histoire-agent-soft); }
.histoire-mcp-activity-current > div { display: flex; align-items: center; gap: 8px; color: var(--histoire-agent-text); }
.histoire-mcp-activity-current strong { flex-shrink: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--histoire-text); font-size: 11px; font-weight: 700; }
.histoire-mcp-activity-current code { flex: 1; }
.histoire-mcp-activity-current > div > span { flex: none; color: var(--histoire-muted); font: 10px var(--histoire-font-mono); }
.histoire-mcp-activity-current button { flex: none; display: grid; place-items: center; width: 24px; height: 24px; color: var(--histoire-danger-text); }
.histoire-mcp-activity-current button:disabled { opacity: .5; cursor: wait; }
progress { appearance: none; display: block; width: 100%; height: 4px; margin-top: 8px; border: 0; border-radius: 999px; background: var(--histoire-surface); overflow: hidden; }
progress::-webkit-progress-bar { background: var(--histoire-surface); border-radius: 999px; }
progress::-webkit-progress-value { background: var(--histoire-agent); border-radius: 999px; }
progress::-moz-progress-bar { background: var(--histoire-agent); border-radius: 999px; }
ul { display: grid; gap: 12px; list-style: none; padding: 6px 0 0; margin: 0; }
li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.histoire-mcp-activity-status { display: flex; flex: none; color: var(--histoire-accent-link); }
li[data-state="failed"] .histoire-mcp-activity-status { color: var(--histoire-danger-text); }
li[data-state="cancelled"] .histoire-mcp-activity-status { color: var(--histoire-muted); }
code { min-width: 0; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.histoire-mcp-activity-target { flex: 1; min-width: 0; color: var(--histoire-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: end; }
time { flex: none; color: var(--histoire-muted); font: 10px var(--histoire-font-mono); }
.histoire-mcp-activity-empty, .histoire-mcp-activity-error { margin: 4px; color: var(--histoire-muted); font-size: 12px; }
.histoire-mcp-activity-error { color: var(--histoire-danger-text); }
</style>
