import type { UiAgentConfigOptions, UiAgentElicitation, UiAgentElicitationReply, UiAgentElicitationResolved, UiAgentPermission, UiAgentRegistry, UiAgentSettings, UiAgentsSnapshot } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { computed, inject, provide, ref, shallowRef } from 'vue'
import { createAgentsCatalogStore } from './agents-catalog.js'

/** Transport separates write-only credential POSTs from safe HMR settings events. */
export interface AgentsTransport {
  /** Safe commands containing no env values. */
  /** Full remote catalog is never sent over HMR. */
  registry?: (force: boolean) => Promise<UiAgentRegistry>
  /** Bounded temporary session discovery. */
  configOptions?: (agentId: string, force: boolean) => Promise<UiAgentConfigOptions>
  send: (event: string, value: unknown) => boolean
  /** Current server settings and process state. */
  snapshot: (callback: (value: UiAgentsSnapshot) => void) => () => void
  /** Agent tool permission cards. */
  permission: (callback: (value: UiAgentPermission) => void) => () => void
  /** Removes completed or cancelled cards. */
  resolved: (callback: (value: { requestId: string }) => void) => () => void
  /** Agent requests for user input shown in their thread. */
  elicitation?: (callback: (value: UiAgentElicitation) => void) => () => void
  /** Removes answered, completed, cancelled or expired input requests. */
  elicitationResolved?: (callback: (value: UiAgentElicitationResolved) => void) => () => void
  /** Clears stale permissions on transport loss. */
  disconnect: (callback: () => void) => () => void
  /** Private credential setter never returns existing values. */
  environment: (agentId: string, env: Record<string, string>) => Promise<void>
}

/** Per-workbench safe settings/status owner; no credentials enter persistence. */
export function createAgentsStore(transport?: AgentsTransport) {
  const state = shallowRef<UiAgentsSnapshot>({ enabled: false, enabledIds: [], presets: [], agents: [], permissions: { fileEdits: 'ask', terminal: 'ask' }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } })
  const permissions = shallowRef<UiAgentPermission[]>([])
  const elicitations = shallowRef<UiAgentElicitation[]>([])
  /** Accepted links waiting for the agent to report completion. */
  const waiting = shallowRef<string[]>([])
  /** Threads currently rendering their own question cards. */
  const shown = shallowRef<string[]>([])
  /** In-thread questions whose thread is not on screen, answered from the floating card. */
  const offscreen = computed(() => ({
    plans: permissions.value.filter(item => item.kind === 'plan' && !shown.value.includes(item.threadId ?? '')),
    elicitations: elicitations.value.filter(item => !shown.value.includes(item.threadId)),
  }))
  /** Threads blocked on a plan approval or input request, oldest question first. */
  const needsInput = computed(() => [...new Set([
    ...permissions.value.flatMap(item => item.kind === 'plan' && item.threadId ? [item.threadId] : []),
    ...elicitations.value.map(item => item.threadId),
  ])])
  /** Tool permissions always use the floating card. */
  const tools = computed(() => permissions.value.filter(item => item.kind !== 'plan'))
  const pending = ref(false)
  const connected = ref(false)
  const error = ref('')
  const catalog = createAgentsCatalogStore(transport, () => state.value, () => connected.value)
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
    transport?.elicitation?.((value) => { if (active && !elicitations.value.some(item => item.requestId === value.requestId)) elicitations.value = [...elicitations.value, value].slice(-8) }),
    transport?.elicitationResolved?.((value) => {
      if (!active) return
      elicitations.value = elicitations.value.filter(item => item.requestId !== value.requestId)
      waiting.value = waiting.value.filter(id => id !== value.requestId)
    }),
    transport?.disconnect(() => {
      if (active) {
        connected.value = false
        catalog.disconnect()
        pending.value = false
        permissions.value = []
        elicitations.value = []
        waiting.value = []
      }
    }),
  ]
  return {
    ...catalog,
    state,
    permissions,
    elicitations,
    waiting,
    offscreen,
    needsInput,
    tools,
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
    /**
     * Sends one authorization choice for a still-live permission request.
     * @param requestId Broker-owned card identity.
     * @param allow Default approve/deny answer.
     * @param remember Allow the same tool category for the session.
     * @param choice Explicit card choice, for cards that list choices.
     */
    reply(requestId: string, allow: boolean, remember = false, choice?: string): void {
      if (!active || !transport || !permissions.value.some(item => item.requestId === requestId)) return
      if (transport.send('histoire:ui:agent-permission-reply', { requestId, allow, remember, ...choice ? { choice } : {} })) permissions.value = permissions.value.filter(item => item.requestId !== requestId)
    },
    /**
     * Plan approvals and input requests owned by one thread, shown inside it.
     * @param threadId Thread identity.
     */
    pendingFor(threadId: string): { plans: UiAgentPermission[], elicitations: UiAgentElicitation[] } {
      return { plans: permissions.value.filter(item => item.kind === 'plan' && item.threadId === threadId), elicitations: elicitations.value.filter(item => item.threadId === threadId) }
    },
    /**
     * Marks a thread as rendering its own question cards until the returned cleanup runs.
     * @param threadId Thread identity.
     */
    show(threadId: string): () => void {
      shown.value = [...shown.value, threadId]
      return () => {
        const index = shown.value.indexOf(threadId)
        if (index !== -1) shown.value = shown.value.filter((_, position) => position !== index)
      }
    },
    /**
     * Answers one input request; the card stays until the server resolves it
     * (an invalid form stays editable, an accepted link waits for completion).
     */
    replyElicitation(requestId: string, action: UiAgentElicitationReply['action'], content?: UiAgentElicitationReply['content']): void {
      const item = elicitations.value.find(value => value.requestId === requestId)
      if (!active || !transport || !item) return
      const sent = transport.send('histoire:ui:agent-elicitation-reply', { requestId, action, ...content ? { content } : {} })
      if (sent && action === 'accept' && item.mode === 'url') waiting.value = [...waiting.value, requestId]
    },
    /** Writes new credentials without reading them or sending them through HMR. */
    async environment(agentId: string, env: Record<string, string>): Promise<boolean> {
      if (!active || !transport) return false
      try {
        await transport.environment(agentId, env)
        if (active) catalog.invalidate()
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
      catalog.close()
      for (const off of cleanup) off?.()
      permissions.value = []
      elicitations.value = []
      waiting.value = []
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
