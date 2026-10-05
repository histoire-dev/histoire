<script setup lang="ts">
import { useMcpStore } from '../../../stores/mcp.js'
import McpClients from './McpClients.vue'
import McpCurrentOperation from './McpCurrentOperation.vue'
import McpEndpoint from './McpEndpoint.vue'
import McpHistory from './McpHistory.vue'

const store = useMcpStore()
</script>

<template>
  <section class="histoire-mcp-panel" aria-label="MCP activity">
    <header>
      <h2>MCP</h2>
      <span class="histoire-mcp-status" :data-status="store.status">
        <span aria-hidden="true" />
        {{ store.status === 'enabled' ? 'Running' : store.status === 'disabled' ? 'Disabled' : 'Unavailable' }}
      </span>
    </header>
    <template v-if="store.status === 'enabled'">
      <McpEndpoint v-if="store.endpoint || store.stdio" />
      <McpClients />
      <McpCurrentOperation v-if="store.current" />
    </template>
    <p v-else class="histoire-mcp-empty" role="status">
      {{ store.status === 'disabled' ? 'MCP disabled in project config.' : 'MCP status unavailable.' }}
    </p>
    <p v-if="store.error" class="histoire-mcp-error" role="alert">
      {{ store.error }}
    </p>
    <p v-if="store.omitted?.reads" class="histoire-mcp-empty" role="status">
      {{ store.omitted.reads }} reads running without activity rows.
    </p>
    <p v-if="store.omitted?.configuration" class="histoire-mcp-empty" role="status">
      Stdio config exceeds activity channel limit.
    </p>
    <McpHistory />
  </section>
</template>

<style scoped>
.histoire-mcp-panel { flex: 1; box-sizing: border-box; padding: 18px 14px; overflow: auto; min-height: 0; color: var(--histoire-text); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 4px 18px; }
h2 { margin: 0; font-size: 15px; font-weight: 700; }
.histoire-mcp-status { display: flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; color: var(--histoire-muted); background: var(--histoire-chip); font-size: 11px; font-weight: 700; }
.histoire-mcp-status[data-status="enabled"] { color: var(--histoire-accent-link); background: var(--histoire-accent-soft); }
.histoire-mcp-status > span { width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
.histoire-mcp-empty { margin: 24px 4px; color: var(--histoire-muted); font-size: 12px; }
.histoire-mcp-error { margin: 12px 4px; color: var(--histoire-danger-text); font-size: 12px; }
</style>
