import type { McpServer } from '@modelcontextprotocol/server'
import type { McpOperationToolService } from './operation-tools.js'
import { observeMcpClientName } from '../observer/client-metadata.js'
import { MCP_INSPECTION_TOOLS } from '../protocol/inspection-schema.js'
import { mcpToolInputSchemas, mcpToolOutputSchemas } from '../protocol/tool-schema.js'
import { readToolResult } from './read-tools.js'

/** Describe fixed inspection scopes without suggesting arbitrary browser execution. */
const descriptions = {
  'inspect-variant': 'Inspect rendered variant state and available automatic prop definitions in a fresh preview.',
  'inspect-dom': 'Inspect bounded DOM attributes, text, geometry and computed styles in a fresh preview.',
  'inspect-accessibility': 'Read Playwright ARIA role/name structure in a fresh preview; this is not an accessibility audit.',
  'runtime-diagnostics': 'Observe bounded console messages, page errors and failed HTTP/network requests in a fresh preview.',
} as const

/** Inspection shares owned admission, cancellation and polling with screenshots. */
export function registerInspectionTools(server: McpServer, operations: McpOperationToolService, principal: string, observeClientName?: (name: string) => void): void {
  for (const kind of Object.keys(MCP_INSPECTION_TOOLS) as (keyof typeof MCP_INSPECTION_TOOLS)[]) {
    if (!operations.hasExecutor(kind)) continue
    const name = MCP_INSPECTION_TOOLS[kind]
    server.registerTool(name, {
      description: `${descriptions[kind]} Returns operation handle; poll histoire_get_operation.`,
      inputSchema: mcpToolInputSchemas[name],
      outputSchema: mcpToolOutputSchemas[name],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, (input, context) => {
      observeMcpClientName(server, context, observeClientName)
      return readToolResult(() => operations.admit(principal, kind, input, context.mcpReq.signal))
    })
  }
}
