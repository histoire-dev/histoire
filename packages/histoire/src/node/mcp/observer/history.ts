import type { UiMcpOperationInfo } from '@histoire/shared'
import { mcpByteLength } from '../protocol/limits.js'

/** Leave room for client metadata, transport configuration and omission counts. */
export const MCP_UI_ACTIVITY_BYTES = 48 * 1024
/** Existing execution admission reserves room independently of observed reads. */
export const MCP_UI_EXECUTION_BYTES = 40 * 1024
/** Observation may omit reads, but never block the read itself or its execution lane. */
export const MCP_UI_READ_BYTES = MCP_UI_ACTIVITY_BYTES - MCP_UI_EXECUTION_BYTES

/** Keep admitted active operations; evict oldest terminal calls by count and UTF-8 bytes. */
export function trimMcpHistory<T>(history: Map<string, T>, project: (entry: T) => UiMcpOperationInfo): number {
  const terminalIds = [...history].filter(([, entry]) => {
    const state = project(entry).state
    return state !== 'queued' && state !== 'running'
  }).map(([id]) => id)
  let bytes = [...history.values()].reduce((total, entry) => total + mcpByteLength(JSON.stringify(project(entry))) + 1, 2)
  let removed = 0
  for (const id of terminalIds) {
    if (terminalIds.length - removed <= 50 && bytes <= MCP_UI_ACTIVITY_BYTES) break
    bytes -= mcpByteLength(JSON.stringify(project(history.get(id)!))) + 1
    history.delete(id)
    removed++
  }
  return removed
}
