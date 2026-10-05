import type { UiAgentPermission, UiAgentSettings, UiAgentsSnapshot } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { inject, provide, ref, shallowRef } from 'vue'

/** Transport separates write-only credential POSTs from safe HMR settings events. */
export interface AgentsTransport {
  /** Safe commands containing no env values. */
  send: (event: string, value: unknown) => boolean
  /** Current server settings and process state. */
  snapshot: (callback: (value: UiAgentsSnapshot) => void) => () => void
  /** Agent tool permission cards. */
  permission: (callback: (value: UiAgentPermission) => void) => () => void
  /** Removes completed or cancelled cards. */
  resolved: (callback: (value: { requestId: string }) => void) => () => void
  /** Clears stale permissions on transport loss. */
  disconnect: (callback: () => void) => () => void
  /** Private credential setter never returns existing values. */
  environment: (agentId: string, env: Record<string, string>) => Promise<void>
}

/** Per-workbench safe settings/status owner; no credentials enter persistence. */
export function createAgentsStore(transport?: AgentsTransport) {
  const state = shallowRef<UiAgentsSnapshot>({ enabled: false, enabledIds: [], presets: [], agents: [], permissions: { fileEdits: 'ask', terminal: 'ask' }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } })
  const permissions = shallowRef<UiAgentPermission[]>([])
  const pending = ref(false)
  const connected = ref(false)
  const error = ref('')
  let active = true
  const cleanup = [
    transport?.snapshot((value) => {
      if (active) {
        state.value = value
        pending.value = false
        connected.value = true
        error.value = value.error ?? ''
      }
    }),
    transport?.permission((value) => { if (active && !permissions.value.some(item => item.requestId === value.requestId)) permissions.value = [...permissions.value, value].slice(-32) }),
    transport?.resolved((value) => { if (active) permissions.value = permissions.value.filter(item => item.requestId !== value.requestId) }),
    transport?.disconnect(() => {
      if (active) {
        connected.value = false
        pending.value = false
        permissions.value = []
      }
    }),
  ]
  return {
    state,
    permissions,
    pending,
    connected,
    error,
    available: Boolean(transport),
    /** Saves explicit local preferences; project config uses separate confirmation. */
    configure(patch: Partial<UiAgentSettings>): void {
      if (!active || !transport || pending.value) return
      const current = state.value
      const settings: UiAgentSettings = { enabled: current.enabled, enabledIds: current.enabledIds, presets: current.presets, permissions: current.permissions, context: current.context, ...patch }
      // Only named settings fields are copied; status/log/snapshot data cannot
      // become a command, and no credential data exists in this store.
      pending.value = transport.send('histoire:ui:agents-configure', settings)
      error.value = ''
    },
    /** Server resets only named local overrides, using its authoritative project defaults. */
    resetProject(paths: ('agents.presets' | 'agents.permissions')[]): void {
      if (!active || !transport || pending.value) return
      pending.value = transport.send('histoire:ui:agents-reset-project', { paths })
      error.value = ''
    },
    /** Explicitly toggles one agent without implicitly starting it. */
    enableAgent(agentId: string, enabled: boolean): void {
      const ids = new Set(state.value.enabledIds)
      if (enabled) ids.add(agentId)
      else ids.delete(agentId)
      this.configure({ enabledIds: [...ids] })
    },
    /** Restart is available only to explicitly enabled agents. */
    restart(agentId: string): void {
      if (active && transport && state.value.enabled && state.value.enabledIds.includes(agentId)) transport.send('histoire:ui:agent-restart', { agentId })
    },
    /** Sends one authorization choice for a still-live permission request. */
    reply(requestId: string, allow: boolean, remember = false): void {
      if (!active || !transport || !permissions.value.some(item => item.requestId === requestId)) return
      if (transport.send('histoire:ui:agent-permission-reply', { requestId, allow, remember })) permissions.value = permissions.value.filter(item => item.requestId !== requestId)
    },
    /** Writes new credentials without reading them or sending them through HMR. */
    async environment(agentId: string, env: Record<string, string>): Promise<boolean> {
      if (!active || !transport) return false
      try {
        await transport.environment(agentId, env)
        return active
      }
      catch {
        if (active) error.value = 'Cannot save environment; check user settings directory'
        return false
      }
    },
    /** Detaches all callbacks and clears every pending card on workbench teardown. */
    close(): void {
      active = false
      for (const off of cleanup) off?.()
      permissions.value = []
      pending.value = false
      connected.value = false
    },
  }
}

/** Provider-owned settings avoid cross-workbench singleton state. */
const agentsKey: InjectionKey<ReturnType<typeof createAgentsStore>> = Symbol('histoire-agents')

/** Installs one development agent store beneath its standalone workbench. */
export function provideAgentsStore(store: ReturnType<typeof createAgentsStore>): void {
  provide(agentsKey, store)
}

/** Reusable/static surfaces have no local agent authority. */
export function useAgentsStore(): ReturnType<typeof createAgentsStore> | undefined {
  return inject(agentsKey, undefined)
}
