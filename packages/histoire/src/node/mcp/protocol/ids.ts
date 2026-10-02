import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod/v4'
import { MCP_LIMITS, mcpByteLength } from './limits.js'

/** Exact existing Histoire ID, including punctuation, preserved without normalization. */
export const mcpIdSchema = z.string().min(1).refine(value => value.isWellFormed() && mcpByteLength(value) <= MCP_LIMITS.idBytes, 'Invalid or oversized Histoire ID')
/** URL authority-safe opaque project identifier. */
export const mcpProjectIdSchema = z.string().regex(/^[\w-]{1,128}$/)
/** Random lifetime marker, never a filesystem identity. */
export const mcpEpochSchema = z.uuid()
/** Completed catalog publication marker. */
export const mcpRevisionSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[1-9]\d*$/)
/** Independent random job/artifact capability. */
export const mcpHandleSchema = z.uuid()
/** Client-controlled retry key; no control characters or non-ASCII data. */
export const mcpRequestKeySchema = z.string().regex(/^[\x20-\x7E]{1,128}$/)
/** Hash of full content, never a shortened edit authorization. */
export const mcpSha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
/** Registered relative metadata; outside-root stories may contain parent segments. */
export const mcpRelativePathSchema = z.string().min(1).refine(value => value.isWellFormed() && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') && !/^[A-Z]:/i.test(value), 'Expected project-relative path')

/** Generate non-disclosing identity salted per controller. Canonicalize roots before calling. */
export function createMcpProjectId(rootOrBuildId: string, salt = randomUUID()): string {
  return createHash('sha256').update(salt).update('\0').update(rootOrBuildId).digest('base64url')
}

/** Generate new runtime lifetime identity. */
export function createMcpEpoch(): string {
  return randomUUID()
}
