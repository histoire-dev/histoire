import type { UiMcpSnapshot } from '@histoire/shared'
import { mcpByteLength } from '../../mcp/protocol/limits.js'
import { UI_CHANNEL_BYTES } from './validation.js'

/** Bound complete reconnect envelope; exact active identities remain admitted and unchanged. */
export function boundMcpSnapshot(value: UiMcpSnapshot): UiMcpSnapshot {
  const snapshot = structuredClone(value)
  const omitted = snapshot.omitted ??= { clients: 0, history: 0, reads: 0 }
  /** Budget the actual Vite frame, including event wrapper, escaped IDs and Unicode. */
  const bytes = () => mcpByteLength(JSON.stringify({ type: 'custom', event: 'histoire:ui:mcp-snapshot', data: snapshot }))
  const history = snapshot.operations.filter(operation => operation.state !== 'queued' && operation.state !== 'running')
    .sort((first, second) => Date.parse(first.startedAt) - Date.parse(second.startedAt))
  for (const operation of history) {
    if (bytes() <= UI_CHANNEL_BYTES) break
    snapshot.operations = snapshot.operations.filter(entry => entry.id !== operation.id)
    omitted.history++
  }
  while (snapshot.clients.length && bytes() > UI_CHANNEL_BYTES) {
    snapshot.clients.shift()
    omitted.clients++
  }
  // Unusual escaped filesystem paths can exceed the envelope reserve. Omit the
  // optional config atomically; never shorten runnable arguments or active IDs.
  if (snapshot.stdio && bytes() > UI_CHANNEL_BYTES) {
    delete snapshot.stdio
    omitted.configuration = true
  }
  return snapshot
}
