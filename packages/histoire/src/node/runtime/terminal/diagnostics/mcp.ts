import type { DiagnosticsMcpDto } from '@histoire/cli/protocol/diagnostics'
import type { UiMcpSnapshot } from '@histoire/shared'
import { truncateText } from '@histoire/cli/protocol/core'
import { DIAGNOSTICS_BOUNDS } from '@histoire/cli/protocol/diagnostics'
import { sanitizeText } from '@histoire/cli/sanitize'
import { getSessionMcp } from '../session-info.js'

/** Reads the live MCP activity snapshot of this runtime; `undefined` when MCP is not running. */
let readSnapshot: () => UiMcpSnapshot | undefined = () => undefined

/**
 * Connects diagnostics to the dev session's MCP runtime (`session.mcp?.snapshot()`), which
 * `dev-child` owns. The existing safe snapshot is reused: protocol arguments, tokens and
 * client envelopes are never read here.
 * @param source Returns the current snapshot, or undefined when MCP is disabled.
 */
export function setMcpSnapshotSource(source: () => UiMcpSnapshot | undefined) {
  readSnapshot = source
}

/** Safe MCP summary from the live snapshot and the published adapter state. */
export function projectMcpDiagnostics(): DiagnosticsMcpDto {
  const published = getSessionMcp()
  const snapshot = readSnapshot()
  // No running MCP runtime means disabled, whatever was published earlier (config can disable it later).
  if (!snapshot) return { status: published.enabled ? 'unavailable' : 'disabled', clients: [], clientsOmitted: 0, activeOperations: 0 }
  const named = snapshot.clients.slice(0, DIAGNOSTICS_BOUNDS.clients)
  return {
    status: snapshot.status,
    ...(snapshot.endpoint ? { endpoint: truncateText(snapshot.endpoint, DIAGNOSTICS_BOUNDS.text).text } : {}),
    ...(published.tokenRequired === undefined ? {} : { tokenRequired: published.tokenRequired }),
    clients: named.map(client => ({ name: truncateText(sanitizeText(client.name), 64).text, transport: client.transport })),
    clientsOmitted: snapshot.clients.length - named.length + (snapshot.omitted?.clients ?? 0),
    activeOperations: snapshot.operations.filter(operation => operation.state === 'queued' || operation.state === 'running').length,
  }
}
