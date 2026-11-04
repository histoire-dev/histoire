import type { DiagnosticsDto } from '@histoire/cli/protocol/diagnostics'
import type { TerminalCommandHandler } from '../registry.js'
import { projectCollectionDiagnostics } from '../diagnostics/collection.js'
import { projectMcpDiagnostics } from '../diagnostics/mcp.js'

/** One-line failure text for a section. */
const reason = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n')[0].slice(0, 256)

/**
 * Handlers of the `diagnostics.*` namespace. `diagnostics.get` projects the current
 * generation's collection issues and a safe MCP summary. Each section is read on its own, so
 * one failing section is reported in `problems` while the other stays usable. The adapter
 * discards a reply whose generation was released meanwhile.
 */
export const diagnosticsHandlers: readonly TerminalCommandHandler[] = [
  {
    operation: 'diagnostics.get',
    async handle(_args, context) {
      const result: DiagnosticsDto = { problems: {} }
      try {
        const snapshot = context.catalog?.current
        if (snapshot) result.collection = projectCollectionDiagnostics(snapshot)
      }
      catch (error) {
        result.problems.collection = reason(error)
      }
      try {
        result.mcp = projectMcpDiagnostics()
      }
      catch (error) {
        result.problems.mcp = reason(error)
      }
      return result
    },
  },
]
