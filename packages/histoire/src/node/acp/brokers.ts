import type { UiAgentPlanDecision, UiAgentSettings } from '@histoire/shared'
import type { AgentRecord } from './record.js'
import type { AcpUpdate } from './types.js'
import { createElicitationBroker } from './elicitations.js'
import { createPermissionBroker } from './permissions.js'

/** Every pending agent question (tool permissions, forms, links) behind one lifecycle. */
export function createAgentBrokers(options: {
  /** Project boundary used for allow-src. */
  root: string
  /** Current local permission policy. */
  policy: () => UiAgentSettings['permissions']
  /** Redacts known secrets. */
  sanitize: (text: string) => string
  /** Publishes one safe manager update. */
  emit: (event: AcpUpdate) => void
  /** Live prompt of an agent, when it runs in this session. */
  active: (agentId: string, sessionId: string) => AgentRecord['active']
}) {
  /** Thread whose active prompt owns an agent session. */
  const threadOf = (agentId: string, sessionId: string) => options.active(agentId, sessionId)?.request.threadId
  /** Appends a plan answer to its live prompt; persistence keeps only the latest ones. */
  const decided = (agentId: string, sessionId: string, decision: UiAgentPlanDecision) => {
    const active = options.active(agentId, sessionId)
    if (active) active.decisions = [...active.decisions ?? [], decision]
  }
  const permissions = createPermissionBroker({ root: options.root, policy: options.policy, sanitize: options.sanitize, threadOf, decided, emit: value => options.emit({ type: 'permission', value }), resolved: requestId => options.emit({ type: 'permission-resolved', value: { requestId } }) })
  const elicitations = createElicitationBroker({ sanitize: options.sanitize, threadOf, emit: value => options.emit({ type: 'elicitation', value }), resolved: value => options.emit({ type: 'elicitation-resolved', value }) })
  return {
    permissions,
    elicitations,
    /** Cancels pending questions of an agent, one of its sessions, or all; forgets session approvals. */
    cancel(agentId?: string, sessionId?: string): void {
      permissions.cancel(agentId, sessionId)
      elicitations.cancel(agentId, sessionId)
    },
    /** Ends a prompt without discarding approvals for its persistent ACP session. */
    settle(agentId: string, sessionId: string): void {
      permissions.settle(agentId, sessionId)
      elicitations.settle(agentId, sessionId)
    },
    /** Cancels everything before the runtime retires. */
    close(): void {
      permissions.close()
      elicitations.close()
    },
  }
}

/** Shared broker bundle owned by one manager. */
export type AgentBrokers = ReturnType<typeof createAgentBrokers>
