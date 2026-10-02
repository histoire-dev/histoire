import { z } from 'zod/v4'
import { mcpIdSchema, mcpProjectIdSchema, mcpRelativePathSchema, mcpRevisionSchema, mcpSha256Schema } from './ids.js'
import { MCP_LIMITS, mcpByteLength } from './limits.js'

/** Bounded text returned by both content tools and resources. */
export const mcpTextSchema = z.string().refine(value => mcpByteLength(value) <= MCP_LIMITS.responseBytes, 'Text page exceeds byte limit')
/** Documentation page measured in Unicode code points. */
export const mcpDocsResultSchema = z.strictObject({
  /** Opaque project identity. */
  projectId: mcpProjectIdSchema,
  /** Captured completed catalog revision. */
  revision: mcpRevisionSchema,
  /** Exact story ID. */
  storyId: mcpIdSchema,
  /** Selected original documentation text. */
  text: mcpTextSchema,
  /** Starting Unicode code point offset. */
  offset: z.number().int().nonnegative(),
  /** Next Unicode code point offset, when remaining text exists. */
  nextOffset: z.number().int().nonnegative().optional(),
  /** Full document length in Unicode code points. */
  totalCharacters: z.number().int().nonnegative(),
  /** Hash of complete original UTF-8 text. */
  sha256: mcpSha256Schema,
  /** Collected custom-block docs are plain text. */
  kind: z.enum(['markdown', 'text']),
  /** Registered path for physical documentation. */
  filePath: mcpRelativePathSchema.optional(),
  /** Selected content association. */
  origin: z.enum(['sibling', 'standalone', 'collected']),
})
/** Raw physical or virtual source page preserving line endings. */
export const mcpSourceResultSchema = z.strictObject({
  projectId: mcpProjectIdSchema,
  revision: mcpRevisionSchema,
  storyId: mcpIdSchema,
  kind: z.enum(['file', 'virtual']),
  filePath: mcpRelativePathSchema,
  text: mcpTextSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  nextLine: z.number().int().positive().optional(),
  sha256: mcpSha256Schema,
})
/** Documentation tool/resource DTO. */
export type McpDocsResult = z.infer<typeof mcpDocsResultSchema>
/** Source tool/resource DTO. */
export type McpSourceResult = z.infer<typeof mcpSourceResultSchema>
