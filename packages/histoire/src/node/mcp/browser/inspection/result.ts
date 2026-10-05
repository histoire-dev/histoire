import type { McpInspectionResult } from '../../protocol/inspection-schema.js'
import { mcpByteLength } from '../../protocol/limits.js'

/** Budget complete result including escaped target IDs, never shortening identities. */
export function boundInspectionResult(result: McpInspectionResult): McpInspectionResult {
  while (mcpByteLength(JSON.stringify(result)) > 60 * 1024) {
    result.truncated = true
    if (result.inspection === 'dom' && result.nodes.length) {
      result.nodes.pop()
    }
    else if (result.inspection === 'diagnostics' && result.entries.length) {
      result.entries.pop()
      result.droppedCount++
    }
    else if (result.inspection === 'accessibility' && result.snapshot.length) {
      result.snapshot = result.snapshot.slice(0, Math.max(0, result.snapshot.length - 1024))
    }
    else if (result.inspection === 'variant') {
      const keys = Object.keys(result.state)
      if (keys.length) delete result.state[keys.at(-1)!]
      else if (result.components.length) result.components.pop()
      else break
      result.omittedValues++
    }
    else {
      break
    }
  }
  return result
}
