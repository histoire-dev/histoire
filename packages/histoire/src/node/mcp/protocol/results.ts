import type { CallToolResult } from '@modelcontextprotocol/server'
import type { z } from 'zod/v4'
import { z as schema } from 'zod/v4'
import { McpDomainError, mcpErrorSchema, toMcpError } from './errors.js'
import { MCP_LIMITS, mcpByteLength } from './limits.js'

/** Strict output union accepted by every registered tool. */
export function mcpOutputSchema<T extends z.ZodType>(data: T) {
  return schema.union([
    schema.strictObject({ ok: schema.literal(true), data }),
    schema.strictObject({ ok: schema.literal(false), error: mcpErrorSchema }),
  ])
}

/** Build matching text/structured success; cap the encoded structured JSON envelope. */
export function successResult<T>(data: T) {
  const structuredContent = { ok: true as const, data }
  const text = JSON.stringify(structuredContent)
  if (mcpByteLength(text) > MCP_LIMITS.responseBytes) {
    throw new McpDomainError('RESULT_TOO_LARGE', 'MCP result exceeds response byte limit')
  }
  return { content: [{ type: 'text' as const, text }], structuredContent } satisfies CallToolResult
}

/** Convert expected failure to tool envelope; unknown exceptions remain generic. */
export function errorResult(error: unknown) {
  const structuredContent = { ok: false as const, error: toMcpError(error) }
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent } satisfies CallToolResult
}
