import { ProtocolError, ResourceNotFoundError } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { PreviewError } from '../../runtime/browser/errors.js'
import { MCP_LIMITS, mcpByteLength } from './limits.js'

/** Expected application failures, shared by tools/resources and operation results. */
export const mcpErrorCodeSchema = z.enum([
  'PROJECT_STARTING',
  'PROJECT_RESTARTING',
  'PROJECT_CLOSED',
  'COLLECTION_FAILED',
  'STORY_NOT_FOUND',
  'STORY_AMBIGUOUS',
  'VARIANT_NOT_FOUND',
  'DOCS_NOT_FOUND',
  'SOURCE_UNAVAILABLE',
  'PATH_OUTSIDE_ROOT',
  'STALE_REVISION',
  'INVALID_CURSOR',
  'INVALID_SELECTOR',
  'CURSOR_EXPIRED',
  'DEPENDENCY_MISSING',
  'CAPABILITY_UNAVAILABLE',
  'BROWSER_UNAVAILABLE',
  'PREVIEW_NOT_READY',
  'QUEUE_FULL',
  'REQUEST_KEY_CONFLICT',
  'OPERATION_NOT_FOUND',
  'ARTIFACT_NOT_FOUND',
  'RESULT_TOO_LARGE',
  'CANCELLED',
  'TIMEOUT',
  'INTERNAL_ERROR',
])
/** Bounded JSON details; callers supply scrubbed paths and diagnostics only. */
const detailsSchema = z.record(z.string(), z.json()).refine(value => mcpByteLength(JSON.stringify(value)) <= MCP_LIMITS.errorDetailsBytes)
/** Public domain error, without stack, raw cause, or environment. */
export const mcpErrorSchema = z.strictObject({
  /** Stable error category. */
  code: mcpErrorCodeSchema,
  /** Bounded human-readable error. */
  message: z.string().refine(value => mcpByteLength(value) <= MCP_LIMITS.diagnosticBytes),
  /** External state changes may make a later attempt useful. */
  retryable: z.boolean(),
  /** Optional sanitized bounded context. */
  details: detailsSchema.optional(),
})
/** Public error category. */
export type McpErrorCode = z.infer<typeof mcpErrorCodeSchema>
/** Public domain error DTO. */
export type McpError = z.infer<typeof mcpErrorSchema>

/** Expected failure suitable for public projection after context-specific scrubbing. */
export class McpDomainError extends Error {
  /** Shared domain category. */
  readonly code: McpErrorCode
  /** Whether changed external state may permit a retry. */
  readonly retryable: boolean
  /** Sanitized bounded JSON details. */
  readonly details?: Record<string, unknown>

  /** Create a domain failure; invalid details are discarded instead of leaking raw data. */
  constructor(code: McpErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message)
    this.name = 'McpDomainError'
    this.code = code
    this.retryable = retryable
    try {
      const parsed = detailsSchema.safeParse(details)
      if (parsed.success) {
        this.details = parsed.data
      }
    }
    catch {
      // Circular or deeply nested raw causes are never public error details.
    }
  }
}

/** Project only deliberate domain errors; unknown exceptions never expose paths or secrets. */
export function toMcpError(error: unknown): McpError {
  if (error instanceof McpDomainError || error instanceof PreviewError) {
    const parsed = mcpErrorSchema.safeParse({ code: error.code, message: error.message, retryable: error.retryable, ...(error instanceof McpDomainError ? { details: error.details } : {}) })
    if (parsed.success) {
      return parsed.data
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'Internal Histoire MCP error', retryable: false }
}

/** Resource failures are SDK protocol errors, never tool-style resource envelopes. */
export function toResourceError(error: unknown, uri?: string): ProtocolError {
  const projected = toMcpError(error)
  const missing = ['STORY_NOT_FOUND', 'DOCS_NOT_FOUND', 'SOURCE_UNAVAILABLE', 'OPERATION_NOT_FOUND', 'ARTIFACT_NOT_FOUND'].includes(projected.code)
  return missing && uri
    ? new ResourceNotFoundError(uri, projected.message)
    : new ProtocolError(missing ? -32602 : -32603, projected.message, projected)
}
