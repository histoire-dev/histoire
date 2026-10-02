import { z } from 'zod/v4'
import { mcpRelativePathSchema, mcpSha256Schema } from '../mcp/protocol/ids.js'
import { mcpDiagnosticSchema } from '../mcp/protocol/project-schema.js'
import { mcpStorySchema } from '../mcp/protocol/story-schema.js'
import { ARTIFACT_SCHEMA_VERSION } from './artifact-version.js'
import { normalizeNodeBase } from './base.js'

/** Storage paths are stricter than output-only registered project metadata paths. */
export const artifactStoragePathSchema = z.string().min(1).max(4096).refine(value => !value.startsWith('/') && !/^[A-Z]:/i.test(value) && !value.includes('\\') && !value.includes('\0') && value.isWellFormed() && value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'))

/** Exact bytes associated with one artifact-relative regular file. */
export const artifactInventoryEntrySchema = z.strictObject({
  /** Relative storage path within its inventory root. */
  path: artifactStoragePathSchema,
  /** Complete file digest. */
  sha256: mcpSha256Schema,
  /** Exact byte count, bounded before runtime allocation. */
  bytes: z.number().int().nonnegative().max(2 ** 31 - 1),
})

/** Digest-named private UTF-8 content; runtime never follows arbitrary metadata paths. */
export const artifactContentRefSchema = artifactInventoryEntrySchema.extend({
  path: z.string().regex(/^content\/[a-f0-9]{64}\.txt$/),
  bytes: z.number().int().nonnegative().max(2 * 1024 * 1024),
}).refine(value => value.path === `content/${value.sha256}.txt`)

/** Source availability is independent of public book Source-panel assets. */
export const artifactSourceSchema = z.union([
  z.strictObject({ ...artifactInventoryEntrySchema.shape, path: z.string().regex(/^content\/[a-f0-9]{64}\.txt$/), bytes: z.number().int().nonnegative().max(2 * 1024 * 1024), kind: z.enum(['file', 'virtual']) }).refine(value => value.path === `content/${value.sha256}.txt`),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.string().max(1024) }),
])

/** Preferred collected or registered Markdown documentation reference. */
export const artifactDocsSchema = z.strictObject({
  ...artifactInventoryEntrySchema.shape,
  path: z.string().regex(/^content\/[a-f0-9]{64}\.txt$/),
  bytes: z.number().int().nonnegative().max(2 * 1024 * 1024),
  kind: z.enum(['markdown', 'text']),
  origin: z.enum(['sibling', 'standalone', 'collected']),
  filePath: mcpRelativePathSchema.optional(),
}).refine(value => value.path === `content/${value.sha256}.txt`)

/** Explicit story projection and allowlisted private content references. */
export const artifactStorySchema = z.strictObject({ story: mcpStorySchema, source: artifactSourceSchema, docs: artifactDocsSchema.optional() })

/** Versioned immutable portable artifact, excluding runtime credentials and project paths. */
export const artifactManifestSchema = z.strictObject({
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  buildId: mcpSha256Schema,
  histoireVersion: z.string().min(1).max(128),
  title: z.string().max(65536),
  base: z.string().refine((value) => {
    try {
      return value === normalizeNodeBase(value)
    }
    catch { return false }
  }),
  routerMode: z.enum(['hash', 'history']),
  defaultColorScheme: z.enum(['auto', 'light', 'dark']),
  /** Initial preview background shared by dev and deployed screenshot targets. */
  backgroundColor: z.string().max(4096).refine(value => value.isWellFormed()),
  mcpEnabled: z.boolean(),
  testRuntimeIncluded: z.boolean(),
  timeouts: z.strictObject({ collect: z.number().int().positive().max(2 ** 31 - 1), storyCollect: z.number().int().positive().max(2 ** 31 - 1), run: z.number().int().positive().max(2 ** 31 - 1) }),
  stories: z.array(artifactStorySchema).max(100000),
  diagnostics: z.array(mcpDiagnosticSchema).max(100),
  diagnosticsTruncated: z.boolean(),
  contents: z.array(artifactContentRefSchema).max(200000),
  publicAssets: z.array(artifactInventoryEntrySchema).max(200000),
})

/** Builder/reader share exact inferred types instead of duplicate DTO definitions. */
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>
/** Collected story with immutable private refs. */
export type ArtifactStory = z.infer<typeof artifactStorySchema>
/** Hash/byte identity of one artifact file. */
export type ArtifactInventoryEntry = z.infer<typeof artifactInventoryEntrySchema>
