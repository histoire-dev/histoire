import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { CLIENT_INFO_META_KEY } from '@modelcontextprotocol/server'

/** Copy only bounded SDK client name; ignore all other handshake/envelope fields. */
export function observeMcpClientName(server: McpServer, context: ServerContext, listener?: (name: string) => void) {
  if (!listener) return
  const envelope = context.mcpReq.envelope as Record<string, unknown> | undefined
  const information = envelope?.[CLIENT_INFO_META_KEY] ?? server.server.getClientVersion()
  if (!information || typeof information !== 'object' || !('name' in information) || typeof information.name !== 'string') return
  const name = information.name.replace(/\p{Cc}/gu, ' ').trim().slice(0, 128)
  if (!name) return
  try {
    listener(name)
  }
  catch { /* Metadata observation cannot fail an MCP tool call. */ }
}
