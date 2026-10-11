import type { UiAgentConfigOptions, UiAgentRegistry, UiAgentsSnapshot } from '@histoire/shared'
import type { AgentsTransport } from './agents.js'
import { ref, shallowRef } from 'vue'

/** Browser request state is separate from bounded authoritative preference snapshots. */
export interface AgentDiscoveryState {
  /** Current request is running. */
  loading: boolean
  /** Controlled actionable failure. */
  error?: string
  /** Safe advertised selectors. */
  value?: UiAgentConfigOptions
  /** Exact settings identity that produced these choices. */
  key: string
}

/** Scoped catalog requests ignore responses after disconnect, reconfiguration or teardown. */
export function createAgentsCatalogStore(transport: AgentsTransport | undefined, snapshot: () => UiAgentsSnapshot, connected: () => boolean) {
  const catalog = shallowRef<UiAgentRegistry>({ entries: [], status: { state: 'unavailable' } })
  const catalogLoading = ref(false)
  const catalogLoaded = ref(false)
  const discoveries = shallowRef<Record<string, AgentDiscoveryState>>({})
  const revision = ref(0)
  let active = true
  let epoch = 0
  let registryRequest: Promise<void> | undefined
  /** Public preset/env-key fingerprint excludes logs and transient process state. */
  function discoveryKey(agentId: string): string {
    const state = snapshot()
    return JSON.stringify([state.enabled, state.enabledIds.includes(agentId), state.presets.find(preset => preset.id === agentId), state.agents.find(agent => agent.id === agentId)?.envKeys, revision.value])
  }
  /** Update one row without replacing another in-flight discovery. */
  function setDiscovery(agentId: string, value: AgentDiscoveryState): void {
    discoveries.value = { ...discoveries.value, [agentId]: value }
  }
  return {
    catalog,
    catalogLoading,
    catalogLoaded,
    discoveries,
    revision,
    discoveryKey,
    /** Registry remains browsable while all agents are disabled. */
    loadRegistry(force = false): Promise<void> {
      if (!active || !transport?.registry || registryRequest) return registryRequest ?? Promise.resolve()
      catalogLoading.value = true
      const captured = epoch
      registryRequest = transport.registry(force).then((value) => {
        if (!active || captured !== epoch) return
        catalog.value = value
        catalogLoaded.value = true
        if (force) revision.value++
      }).catch(() => {
        if (active && captured === epoch) {
          catalog.value = { ...catalog.value, status: { state: catalog.value.entries.length ? 'stale' : 'unavailable', error: 'Cannot load agent registry' } }
          catalogLoaded.value = true
        }
      }).finally(() => {
        registryRequest = undefined
        if (active && captured === epoch) catalogLoading.value = false
      })
      return registryRequest
    },
    /** Repeated renders reuse current choices; discovery never enables an agent. */
    async discoverAgent(agentId: string, force = false): Promise<void> {
      const state = snapshot()
      if (!active || !connected() || !transport?.configOptions || !state.enabled || !state.enabledIds.includes(agentId)) return
      const key = discoveryKey(agentId)
      const prior = discoveries.value[agentId]
      if (prior?.key === key && (prior.loading || (!force && (prior.value || prior.error)))) return
      const captured = epoch
      setDiscovery(agentId, { key, loading: true })
      try {
        const value = await transport.configOptions(agentId, force)
        if (active && captured === epoch && connected() && key === discoveryKey(agentId)) setDiscovery(agentId, { key, loading: false, value })
      }
      catch (error) {
        if (active && captured === epoch && key === discoveryKey(agentId)) setDiscovery(agentId, { key, loading: false, error: error instanceof Error ? error.message : 'Cannot load models; check command, authentication and logs' })
      }
    },
    /** Credential updates invalidate choices without exposing credential values. */
    invalidate(): void {
      revision.value++
      discoveries.value = {}
    },
    /** Existing rows remain visible offline, while stale requests lose authority. */
    disconnect(): void {
      epoch++
      discoveries.value = {}
      catalogLoading.value = false
    },
    /** No late HTTP response can resurrect disposed workbench state. */
    close(): void {
      active = false
      epoch++
      discoveries.value = {}
      catalogLoading.value = false
    },
  }
}
