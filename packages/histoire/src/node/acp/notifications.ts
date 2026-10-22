import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { UiAgentCommand } from '@histoire/shared'
import type { AgentRecord } from './record.js'
import type { AcpUpdate } from './types.js'
import { projectAgentCommands } from './projection.js'
import { emitReplyChunks } from './reply-chunks.js'

/** Manager callbacks used while routing one agent notification. */
export interface AgentNotificationRouting {
  /** Stores the agent's newest slash commands. */
  remember: (agentId: string, commands: UiAgentCommand[]) => void
  /** Safe error/path projection. */
  sanitize: (text: string) => string
  /** Publishes one safe manager update. */
  emit: (event: AcpUpdate) => void
}

/**
 * Routes one ACP session notification: commands and config updates apply to the record,
 * reply chunks and activity only to the exact active prompt/session.
 * @param agentId Agent preset id.
 * @param record Captured agent record.
 * @param notification Incoming notification.
 * @param routing Manager callbacks.
 */
export function routeAgentNotification(agentId: string, record: AgentRecord, notification: SessionNotification, routing: AgentNotificationRouting): void {
  const update = notification.update
  if (update.sessionUpdate === 'available_commands_update') {
    routing.remember(agentId, projectAgentCommands(update.availableCommands, routing.sanitize))
    return
  }
  if (update.sessionUpdate === 'config_option_update') {
    const session = [...record.sessions.values()].find(session => session.sessionId === notification.sessionId)
    if (session) session.configOptions = update.configOptions
    return
  }
  const active = record.active
  if (!active || notification.sessionId !== active.sessionId) return
  active.changes.update(notification)
  for (const step of active.activity.update(notification)) routing.emit({ type: 'activity', value: { agentId, threadId: active.request.threadId, step } })
  if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
    const text = active.output.push(update.content.text)
    if (!text) return
    active.text = `${active.text}${text}`.slice(-256_000)
    emitReplyChunks(agentId, active.request, text, routing.emit)
  }
}
