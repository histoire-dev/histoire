<script setup lang="ts">
import { computed } from 'vue'
import { mcpTimeAgo } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const store = useMcpStore()

/** Index running clients once so status updates never scan operations per mounted row. */
const rows = computed(() => {
  const running = new Set(store.running.filter(operation => operation.state === 'running').map(operation => operation.clientId))
  return store.clients.map(client => ({ key: client.id, client, active: running.has(client.id) }))
})
</script>

<template>
  <section class="histoire-mcp-clients" aria-label="Connected MCP clients">
    <h3>Clients</h3>
    <p v-if="!store.clients.length">
      No clients connected.
    </p>
    <WorkbenchVirtualList v-else :items="rows" :min-item-size="47" list-tag="ul" item-tag="li" page-mode>
      <template #default="{ item: { client, active } }">
        <div class="histoire-mcp-client-row">
          <span class="histoire-mcp-client-icon" :data-active="active"><WorkbenchIcon name="bot" :size="20" /></span>
          <span class="histoire-mcp-client-details">
            <strong>{{ client.name }}</strong>
            <span>{{ client.transport }} · {{ active ? mcpTimeAgo(client.connectedAt, store.now) : `idle ${mcpTimeAgo(client.lastSeenAt, store.now)}` }}</span>
          </span>
          <span class="histoire-mcp-client-dot" :data-active="active" :aria-label="active ? 'Active' : 'Idle'" />
        </div>
      </template>
    </WorkbenchVirtualList>
  </section>
</template>

<style scoped>
.histoire-mcp-clients { margin: 0 4px 22px; }
h3 { margin: 0 0 14px; color: var(--histoire-muted); font-size: 12px; font-weight: 600; }
p { margin: 0; color: var(--histoire-muted); font-size: 12px; }
.histoire-mcp-client-row { display: flex; align-items: center; gap: 10px; padding: var(--histoire-mcp-row-padding, 8px) 0; }
.histoire-mcp-client-icon { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 9px; color: var(--histoire-muted); background: var(--histoire-chip); }
.histoire-mcp-client-icon[data-active="true"] { color: var(--histoire-agent-text); background: var(--histoire-agent-soft); }
.histoire-mcp-client-details { display: grid; flex: 1; min-width: 0; gap: 1px; }
strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
.histoire-mcp-client-details > span { font-size: 11px; color: var(--histoire-muted); }
.histoire-mcp-client-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--histoire-border); }
.histoire-mcp-client-dot[data-active="true"] { background: var(--histoire-accent); }
</style>
