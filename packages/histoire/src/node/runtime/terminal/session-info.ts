import type { SessionMcpDto } from '@histoire/cli/protocol/session'

/**
 * MCP adapter state for `session.get`. A runtime process serves exactly one
 * generation, and the adapter is created inside the dev session after the
 * terminal adapter, so `dev-child` publishes it here once it is known.
 */
let mcp: SessionMcpDto = { enabled: false }

/**
 * Publishes the MCP adapter state of this runtime process.
 * @param next Enabled flag, bound URL and whether a token is required.
 */
export function setSessionMcp(next: SessionMcpDto) {
  mcp = { ...next }
}

/** Current MCP adapter state. */
export function getSessionMcp(): SessionMcpDto {
  return { ...mcp }
}
