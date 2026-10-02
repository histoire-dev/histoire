import { z } from 'zod/v4'
import { mcpEpochSchema, mcpIdSchema, mcpProjectIdSchema, mcpRelativePathSchema, mcpRevisionSchema, mcpSha256Schema } from './ids.js'
import { MCP_LIMITS, mcpByteLength } from './limits.js'
import { mcpStorySchema } from './story-schema.js'

/** Bounded public collection/lifecycle diagnostic. */
export const mcpDiagnosticSchema = z.strictObject({
  /** Registered relative path, when known. */
  filePath: mcpRelativePathSchema.optional(),
  /** Collected story identity, when known. */
  storyId: mcpIdSchema.optional(),
  /** Stable diagnostic category. */
  code: z.string().min(1).max(128),
  /** Scrubbed human-readable message. */
  message: z.string().refine(value => mcpByteLength(value) <= MCP_LIMITS.diagnosticBytes),
})
/** Public browser availability; probing never launches or installs browsers. */
export const mcpCapabilitySchema = z.strictObject({ available: z.boolean(), reason: z.string().optional() })
/** Public project lifecycle and feature projection. */
export const mcpProjectSchema = z.strictObject({
  /** Opaque controller identity. */
  projectId: mcpProjectIdSchema,
  /** Current runtime lifetime. */
  epoch: mcpEpochSchema,
  /** Development project or immutable deployment. */
  runtimeMode: z.enum(['dev', 'node']),
  /** Immutable artifact identity in Node mode. */
  buildId: mcpSha256Schema.optional(),
  /** Captured lifecycle state. */
  status: z.enum(['starting', 'ready', 'restarting', 'failed', 'closed']),
  /** Latest completed catalog publication. */
  revision: mcpRevisionSchema.optional(),
  /** Collection running against last completed revision. */
  updating: z.boolean(),
  /** Configured book title. */
  title: z.string(),
  /** Book deployment base. */
  base: z.string(),
  /** Browser router mode. */
  routerMode: z.enum(['hash', 'history']),
  /** Number of published stories. */
  storyCount: z.number().int().nonnegative(),
  /** Number of published variants. */
  variantCount: z.number().int().nonnegative(),
  /** Explicit metadata and browser availability. */
  capabilities: z.strictObject({
    catalog: z.boolean(),
    content: z.boolean(),
    previews: z.boolean(),
    screenshots: mcpCapabilitySchema,
    tests: mcpCapabilitySchema.extend({ engine: z.enum(['project-vitest', 'built-preview', 'unavailable']) }),
  }),
  /** Bounded current diagnostics. */
  diagnostics: z.array(mcpDiagnosticSchema).max(MCP_LIMITS.diagnostics),
  /** Additional diagnostics were omitted by limit. */
  diagnosticsTruncated: z.boolean().optional(),
})
/** Inferred lifecycle DTO. */
export type McpProject = z.infer<typeof mcpProjectSchema>
/** Inferred collection diagnostic DTO. */
export type McpDiagnostic = z.infer<typeof mcpDiagnosticSchema>

/** Stable catalog page pinned to one revision. */
export const mcpListStoriesResultSchema = z.strictObject({
  projectId: mcpProjectIdSchema,
  revision: mcpRevisionSchema,
  updating: z.boolean(),
  items: z.array(mcpStorySchema).max(MCP_LIMITS.maxPageSize),
  nextCursor: z.string().optional(),
  total: z.number().int().nonnegative(),
  diagnostics: z.array(mcpDiagnosticSchema).max(MCP_LIMITS.diagnostics),
  diagnosticsTruncated: z.boolean(),
})
