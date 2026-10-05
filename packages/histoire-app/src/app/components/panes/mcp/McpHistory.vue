<script setup lang="ts">
import { HstSwitch } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { mcpOperationIcon, mcpTargetLabel, mcpTimeAgo } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const store = useMcpStore()
const snapshot = useHistoireSnapshot()
/** Exact operation IDs keep final status attached to the same recycled history row. */
const rows = computed(() => store.history.map(operation => ({ key: operation.id, operation })))
</script>

<template>
  <section class="histoire-mcp-history" aria-label="MCP operation history">
    <header>
      <h3>History</h3>
      <HstSwitch v-model="store.follow" title="Follow" aria-label="Follow MCP operations" class="history-follow" />
    </header>
    <p v-if="!store.history.length">
      No tool calls yet.
    </p>
    <WorkbenchVirtualList v-else :items="rows" :min-item-size="45" list-tag="ul" item-tag="li" page-mode>
      <template #default="{ item: { operation } }">
        <div class="histoire-mcp-history-row" :data-state="operation.state">
          <span class="histoire-mcp-history-status" :aria-label="operation.state"><WorkbenchIcon :name="mcpOperationIcon(operation)" /></span>
          <span class="histoire-mcp-history-detail">
            <code :title="operation.tool">{{ operation.tool }}</code>
            <span>{{ mcpTargetLabel(operation.target, snapshot.catalog) || store.clientName(operation.clientId) }}{{ operation.state === 'failed' ? ' · failed' : operation.state === 'cancelled' ? ' · cancelled' : '' }}</span>
          </span>
          <time :datetime="operation.endedAt ?? operation.startedAt" :title="operation.endedAt ?? operation.startedAt">{{ mcpTimeAgo(operation.endedAt ?? operation.startedAt, store.now) }}</time>
        </div>
      </template>
    </WorkbenchVirtualList>
  </section>
</template>

<style scoped>
.histoire-mcp-history { margin: 0 4px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.history-follow { padding: 0; margin: 0; }
h3 { margin: 0; color: var(--histoire-muted); font-size: 12px; font-weight: 600; }
p { margin: 0; font-size: 12px; color: var(--histoire-muted); }
.histoire-mcp-history-row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: var(--histoire-mcp-row-padding, 8px) 0; }
.histoire-mcp-history-status { display: flex; flex: none; color: var(--histoire-accent-link); }
.histoire-mcp-history-row[data-state="failed"] .histoire-mcp-history-status { color: var(--histoire-danger-text); }
.histoire-mcp-history-row[data-state="cancelled"] .histoire-mcp-history-status { color: var(--histoire-muted); }
.histoire-mcp-history-detail { display: grid; flex: 1; min-width: 0; gap: 1px; }
code { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.histoire-mcp-history-detail > span { color: var(--histoire-muted); font-size: 11px; overflow-wrap: anywhere; }
time { flex: none; color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 10px; }
</style>
