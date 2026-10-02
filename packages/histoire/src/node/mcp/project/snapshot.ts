import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { McpDiagnostic } from '../protocol/project-schema.js'
import type { McpStory } from '../protocol/story-schema.js'
import type { StoryContentEntry } from './content-index.js'
import { Buffer } from 'node:buffer'
import { MCP_LIMITS } from '../protocol/limits.js'
import { mcpStorySchema } from '../protocol/story-schema.js'
import { CatalogContentChangedError, hashContent, indexStoryContent } from './content-index.js'
import { boundedDiagnostics, sanitizeDiagnosticMessage } from './diagnostics.js'

/** Immutable public metadata and private content indexes after one completed batch. */
export interface CatalogSnapshot {
  /** Opaque controller project identity. */
  projectId: string
  /** Active generation identity. */
  epoch: string
  /** Assigned only after a completed, different catalog publication. */
  revision: string
  /** Detached allowlisted DTOs in deterministic relative-path order. */
  stories: readonly McpStory[]
  /** Bounded public collection/content/identity diagnostics. */
  diagnostics: readonly McpDiagnostic[]
  /** True when additional diagnostics were dropped. */
  diagnosticsTruncated: boolean
  /** No successful or empty outcomes and at least one collection failure. */
  failed: boolean
  /** Private registered source/docs handles, indexed by relative file path. */
  contents: ReadonlyMap<string, StoryContentEntry>
  /** Internal full-content fingerprint used to avoid meaningless revision churn. */
  fingerprint: string
}

/** Context required for secure projection; no runtime objects escape publicly. */
export interface SnapshotOptions {
  /** Opaque project identity. */
  projectId: string
  /** Current runtime generation. */
  epoch: string
  /** Captured credential removed from errors. */
  secret?: string
}

/** Captures one completed context, omitting failed/uncollected files from target lookup. */
export async function captureCatalogSnapshot(ctx: Context, options: SnapshotOptions, outcomes = new Map<string, StoryCollectionOutcome>()) {
  const diagnostics: McpDiagnostic[] = []
  const contents = new Map<string, StoryContentEntry>()
  const stories: McpStory[] = []
  let failedFiles = 0
  let validOutcomes = 0
  // Clone the entire metadata projection before awaiting file reads. A later
  // queued collector batch cannot leak partially mutated runtime objects.
  const files = ctx.storyFiles.map(file => ({ ...file, treePath: file.treePath?.slice(), story: file.story && { ...file.story, variants: (file.story.variants ?? []).map(v => ({ id: v.id, title: v.title })) }, markdownFile: file.markdownFile && { ...file.markdownFile } }))
  for (const file of files) {
    const outcome = outcomes.get(file.path)
    if (outcome?.status === 'failed') {
      failedFiles++
      diagnostics.push({ filePath: file.relativePath, code: 'COLLECTION_FAILED', message: sanitizeDiagnosticMessage(outcome.error ?? 'Story collection failed', ctx.root, options.secret) })
      continue
    }
    if (outcome?.status === 'empty') {
      validOutcomes++
      continue
    }
    if (!file.story) {
      diagnostics.push({ filePath: file.relativePath, code: 'COLLECTION_PENDING', message: 'Story has not completed collection' })
      continue
    }
    validOutcomes++
    let content: StoryContentEntry
    try {
      content = await indexStoryContent(ctx.root, file)
    }
    catch (error) {
      if (error instanceof CatalogContentChangedError) throw error
      content = { source: { kind: 'unavailable', reason: sanitizeDiagnosticMessage(error, ctx.root, options.secret) } }
    }
    if (content.source.kind === 'unavailable') diagnostics.push({ filePath: file.relativePath, storyId: file.story.id, code: 'SOURCE_UNAVAILABLE', message: sanitizeDiagnosticMessage(content.source.reason, ctx.root, options.secret) })
    if (content.docsUnavailableReason) diagnostics.push({ filePath: file.relativePath, storyId: file.story.id, code: 'DOCS_UNAVAILABLE', message: sanitizeDiagnosticMessage(content.docsUnavailableReason, ctx.root, options.secret) })
    if (outcome?.sourceSha256 && content.source.sha256 && outcome.sourceSha256 !== content.source.sha256) throw new CatalogContentChangedError('Source changed after story collection')
    const story: McpStory = {
      id: file.story.id,
      title: file.story.title,
      treePath: file.treePath ?? [file.story.title],
      filePath: file.relativePath.replace(/\\/g, '/'),
      supportPluginId: file.supportPluginId,
      docsOnly: file.story.docsOnly === true,
      variants: file.story.variants,
      docsAvailable: !!content.docs,
      sourceAvailable: content.source.kind !== 'unavailable',
      sourceKind: content.source.kind,
      ...(file.story.group == null ? {} : { group: file.story.group }),
    }
    if (!mcpStorySchema.safeParse(story).success) {
      diagnostics.push({ filePath: story.filePath, code: 'INVALID_METADATA', message: 'Collected metadata contains invalid IDs or fields' })
      continue
    }
    if (Buffer.byteLength(JSON.stringify(story)) > MCP_LIMITS.responseBytes / 2) {
      diagnostics.push({ filePath: story.filePath, code: 'RESULT_TOO_LARGE', message: 'Story metadata exceeds response size limit' })
      continue
    }
    stories.push(story)
    Object.freeze(content.source)
    if (content.docs) Object.freeze(content.docs)
    contents.set(story.filePath, Object.freeze(content))
  }
  stories.sort((a, b) => a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const ids = new Map<string, number>()
  for (const story of stories) ids.set(story.id, (ids.get(story.id) ?? 0) + 1)
  for (const story of stories) {
    if (ids.get(story.id) > 1) diagnostics.push({ filePath: story.filePath, storyId: story.id, code: 'STORY_AMBIGUOUS', message: 'Story ID is ambiguous across registered files' })
    const variantIds = new Set<string>()
    for (const variant of story.variants) {
      if (variantIds.has(variant.id)) diagnostics.push({ filePath: story.filePath, storyId: story.id, code: 'VARIANT_AMBIGUOUS', message: `Variant ID is ambiguous within story: ${variant.id}` })
      variantIds.add(variant.id)
      Object.freeze(variant)
    }
    Object.freeze(story.variants)
    Object.freeze(story.treePath)
    Object.freeze(story)
  }
  const bounded = boundedDiagnostics(diagnostics)
  const failed = failedFiles > 0 && validOutcomes === 0
  const fingerprint = hashContent(JSON.stringify({ stories, ...bounded, failed, content: [...contents].map(([file, entry]) => [file, entry.source.sha256, entry.source.reason, entry.docsUnavailableReason, entry.docs?.sha256, entry.docs?.physicalSha256]) }))
  return { projectId: options.projectId, epoch: options.epoch, stories: Object.freeze(stories), ...bounded, failed, contents, fingerprint }
}
