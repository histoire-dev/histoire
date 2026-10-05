import { z } from 'zod/v4'
import { mcpDocsResultSchema, mcpSourceResultSchema } from './content-schema.js'
import { mcpHandleSchema, mcpIdSchema, mcpRequestKeySchema, mcpRevisionSchema } from './ids.js'
import { mcpInspectionInputSchemas } from './inspection-schema.js'
import { MCP_LIMITS } from './limits.js'
import { mcpOperationSchema } from './operation-schema.js'
import { mcpPreviewInputFields } from './preview-input.js'
import { mcpListStoriesResultSchema, mcpProjectSchema } from './project-schema.js'
import { mcpOutputSchema } from './results.js'
import { mcpPreviewResultSchema, mcpStoryResultSchema } from './story-schema.js'

/** Common captured-revision constraint. */
const revision = {
  /** Caller-required completed catalog revision. */
  expectedRevision: mcpRevisionSchema.optional(),
}
/** Exact story target, never a caller-supplied file or URL. */
const story = {
  /** Exact registered story identity. */
  storyId: mcpIdSchema,
  ...revision,
}
/** Canonical schema objects for every public tool; unknown keys always fail. */
export const mcpToolInputSchemas = {
  /** Read lifecycle without triggering collection. */
  histoire_get_project: z.strictObject({}),
  /** Search immutable catalog snapshot. */
  histoire_list_stories: z.strictObject({
    /** Case-insensitive substring query. */
    query: z.string().max(256).optional(),
    /** Exact framework support filter. */
    supportPluginId: z.string().max(256).optional(),
    /** Exact navigation group filter. */
    group: z.string().max(256).optional(),
    /** Bounded item count. */
    pageSize: z.number().int().min(1).max(MCP_LIMITS.maxPageSize).default(MCP_LIMITS.pageSize),
    /** Captured-snapshot cursor returned by previous page. */
    cursor: z.string().max(4096).optional(),
  }),
  /** Read exact story metadata. */
  histoire_get_story: z.strictObject(story),
  /** Page documentation in Unicode code points. */
  histoire_get_docs: z.strictObject({
    ...story,
    /** Starting Unicode code point index. */
    offset: z.number().int().nonnegative().default(0),
    /** Maximum Unicode code points. */
    limit: z.number().int().min(1).max(MCP_LIMITS.maxDocsCharacters).default(MCP_LIMITS.docsCharacters),
  }),
  /** Read raw registered source, preserving original newlines. */
  histoire_get_source: z.strictObject({
    ...story,
    /** One-based original line index. */
    startLine: z.number().int().positive().default(1),
    /** Maximum original lines. */
    lineCount: z.number().int().min(1).max(MCP_LIMITS.maxSourceLines).default(MCP_LIMITS.sourceLines),
  }),
  /** Resolve exact preview tuple without launching browser. */
  histoire_get_preview: z.strictObject({
    ...story,
    /** Exact scoped target variant. */
    variantId: mcpIdSchema,
  }),
  /** Admit bounded screenshot operation. */
  histoire_capture_screenshot: z.strictObject(mcpPreviewInputFields),
  ...mcpInspectionInputSchemas,
  /** Admit story or targeted variant tests. */
  histoire_run_tests: z.strictObject({
    ...story,
    /** Exact scoped target, omitted for all variants in story. */
    variantId: mcpIdSchema.optional(),
    /** Principal-scoped bounded retry identity. */
    requestKey: mcpRequestKeySchema,
  }),
  /** Poll exact principal-owned operation. */
  histoire_get_operation: z.strictObject({
    /** Exact random operation capability. */
    operationId: mcpHandleSchema,
  }),
  /** Cancel exact principal-owned operation. */
  histoire_cancel_operation: z.strictObject({
    /** Exact random operation capability. */
    operationId: mcpHandleSchema,
  }),
} as const
/** Exact tool name union used by registration and IPC. */
export type McpToolName = keyof typeof mcpToolInputSchemas
/** Parsed tool input, including validated defaults. */
export type McpToolInput<T extends McpToolName> = z.infer<(typeof mcpToolInputSchemas)[T]>

/** Strict output unions used by SDK tool registration. */
export const mcpToolOutputSchemas = {
  histoire_get_project: mcpOutputSchema(mcpProjectSchema),
  histoire_list_stories: mcpOutputSchema(mcpListStoriesResultSchema),
  histoire_get_story: mcpOutputSchema(mcpStoryResultSchema),
  histoire_get_docs: mcpOutputSchema(mcpDocsResultSchema),
  histoire_get_source: mcpOutputSchema(mcpSourceResultSchema),
  histoire_get_preview: mcpOutputSchema(mcpPreviewResultSchema),
  histoire_capture_screenshot: mcpOutputSchema(mcpOperationSchema),
  histoire_run_tests: mcpOutputSchema(mcpOperationSchema),
  histoire_inspect_variant: mcpOutputSchema(mcpOperationSchema),
  histoire_inspect_dom: mcpOutputSchema(mcpOperationSchema),
  histoire_inspect_accessibility: mcpOutputSchema(mcpOperationSchema),
  histoire_get_runtime_diagnostics: mcpOutputSchema(mcpOperationSchema),
  histoire_get_operation: mcpOutputSchema(mcpOperationSchema),
  histoire_cancel_operation: mcpOutputSchema(mcpOperationSchema),
} as const
