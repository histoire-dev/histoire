import { Buffer } from 'node:buffer'
import { z } from 'zod/v4'
import { McpDomainError } from './errors.js'
import { mcpProjectIdSchema, mcpRevisionSchema, mcpSha256Schema } from './ids.js'

/** Snapshot-bound pagination state; encoded JSON is not an authorization token. */
const mcpCursorSchema = z.strictObject({
  /** Captured controller identity. */
  projectId: mcpProjectIdSchema,
  /** Captured completed snapshot. */
  revision: mcpRevisionSchema,
  /** Canonical filter fingerprint. */
  filterHash: mcpSha256Schema,
  /** Next sorted item index. */
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
/** Shared cursor projection. */
export type McpCursor = z.infer<typeof mcpCursorSchema>

/** Serialize canonical validated state independently of resource URI encoding. */
export function encodeMcpCursor(cursor: McpCursor): string {
  return Buffer.from(JSON.stringify(mcpCursorSchema.parse(cursor)), 'utf8').toString('base64url')
}

/** Validate encoding and caller-owned context; snapshot retention is checked by catalog. */
export function decodeMcpCursor(cursor: string, expected: Pick<McpCursor, 'projectId' | 'filterHash'> & { revision?: string }): McpCursor {
  try {
    if (!/^[\w-]{1,4096}$/.test(cursor)) {
      throw new Error('Invalid base64url')
    }
    const bytes = Buffer.from(cursor, 'base64url')
    if (bytes.toString('base64url') !== cursor) {
      throw new Error('Noncanonical base64url')
    }
    const value = mcpCursorSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    if (value.projectId !== expected.projectId || value.filterHash !== expected.filterHash || (expected.revision && value.revision !== expected.revision)) {
      throw new Error('Cursor does not match context')
    }
    return value
  }
  catch {
    throw new McpDomainError('INVALID_CURSOR', 'Invalid catalog cursor')
  }
}
