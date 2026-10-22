import type { createAgentsStore } from '../stores/agents.js'
import { computed, watch } from 'vue'

/**
 * Current model/effort/mode discovery of one agent, started whenever the agent is enabled and its identity changes.
 * @param agents Workbench agents store; absent outside the workbench.
 * @param agentId Agent to discover.
 */
export function useAgentDiscovery(agents: ReturnType<typeof createAgentsStore> | undefined, agentId: () => string | undefined) {
  /** Disabled global policy never causes a process launch. */
  const allowed = computed(() => {
    const id = agentId()
    return Boolean(agents && id && agents.connected.value && agents.state.value.enabled && agents.state.value.enabledIds.includes(id))
  })
  /** Only choices for the current command/model/environment identity are usable. */
  const discovery = computed(() => {
    const id = agentId()
    const state = agents && id ? agents.discoveries.value[id] : undefined
    return state && state.key === agents!.discoveryKey(id!) ? state : undefined
  })
  watch(() => [allowed.value, agentId() && agents?.discoveryKey(agentId()!)], () => {
    if (allowed.value) void agents!.discoverAgent(agentId()!)
  }, { immediate: true })
  return { allowed, discovery }
}
