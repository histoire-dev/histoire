import { z } from 'zod/v4'
import { CAPTURE_LIMITS } from '../../runtime/browser/limits.js'
import { mcpErrorSchema } from './errors.js'
import { mcpEpochSchema, mcpHandleSchema, mcpIdSchema, mcpProjectIdSchema, mcpRevisionSchema, mcpSha256Schema } from './ids.js'
import { mcpInspectionResultSchema } from './inspection-schema.js'
import { MCP_LIMITS } from './limits.js'
import { mcpTestSummarySchema } from './test-schema.js'

/** Retained PNG metadata; binary content is separately served through artifact resource. */
export const mcpScreenshotResultSchema = z.strictObject({
  /** Exact target story. */
  storyId: mcpIdSchema,
  /** Exact target variant. */
  variantId: mcpIdSchema,
  /** Decoded PNG device pixel width. */
  width: z.number().int().min(CAPTURE_LIMITS.minWidth).max(CAPTURE_LIMITS.width * CAPTURE_LIMITS.deviceScaleFactor),
  /** Decoded PNG device pixel height. */
  height: z.number().int().min(CAPTURE_LIMITS.minHeight).max(CAPTURE_LIMITS.height * CAPTURE_LIMITS.deviceScaleFactor),
  /** PNG-only output. */
  mimeType: z.literal('image/png'),
  /** Full image byte count. */
  bytes: z.number().int().nonnegative().max(MCP_LIMITS.artifactBytes),
  /** Full image hash. */
  sha256: mcpSha256Schema,
  /** Canonical principal-scoped artifact URI. */
  artifactUri: z.string(),
})
/** Existing shared summary with explicit development/deployment execution engine. */
export const mcpTestResultSchema = z.strictObject({
  /** Target story. */
  storyId: mcpIdSchema,
  /** Optional targeted variant; absent means whole story. */
  variantId: mcpIdSchema.optional(),
  /** Runtime that performed tests. */
  engine: z.enum(['project-vitest', 'built-preview']),
  /** Sanitized shared runner summary. */
  summary: mcpTestSummarySchema,
  /** Poll response cases are paged when full result exceeds response bound. */
  truncated: z.boolean(),
})
/** Exact owned operation, with one terminal transition and captured generation. */
export const mcpOperationSchema = z.strictObject({
  /** Random independent capability. */
  operationId: mcpHandleSchema,
  /** Captured opaque project. */
  projectId: mcpProjectIdSchema,
  /** Captured runtime lifetime. */
  epoch: mcpEpochSchema,
  /** Captured stable publication. */
  revision: mcpRevisionSchema,
  /** Execution service kind. */
  kind: z.enum(['screenshot', 'tests', 'inspect-variant', 'inspect-dom', 'inspect-accessibility', 'runtime-diagnostics']),
  /** Current lifecycle state; cancelling retains execution slot. */
  state: z.enum(['queued', 'running', 'cancelling', 'completed', 'failed', 'cancelled']),
  /** Admission UTC time. */
  createdAt: z.iso.datetime(),
  /** Execution UTC time. */
  startedAt: z.iso.datetime().optional(),
  /** Terminal UTC time. */
  finishedAt: z.iso.datetime().optional(),
  /** Retained successful result. */
  result: z.union([mcpScreenshotResultSchema, mcpTestResultSchema, mcpInspectionResultSchema]).optional(),
  /** Deliberate domain failure. */
  error: mcpErrorSchema.optional(),
})
/** Public operation DTO. */
export type McpOperation = z.infer<typeof mcpOperationSchema>
/** Public screenshot result DTO. */
export type McpScreenshotResult = z.infer<typeof mcpScreenshotResultSchema>
/** Public test result DTO reusing shared summary. */
export type McpTestResult = z.infer<typeof mcpTestResultSchema>
