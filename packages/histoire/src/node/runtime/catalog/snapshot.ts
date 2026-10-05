import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { StoryContentEntry } from '../content/types.js'
import type { CatalogDiagnostic, CatalogSnapshot, CatalogStory, SnapshotOptions } from './types.js'
import { normalizeHistoireMatrixHint } from '@histoire/protocol'
import { CatalogContentChangedError, hashContent, indexStoryContent } from '../content/index.js'
import { boundedDiagnostics, sanitizeDiagnosticMessage } from './diagnostics.js'
import { immutableMap } from './immutable.js'
import { validStory } from './lookup.js'
import { projectCatalog } from './projection.js'
import { getStoryRuntimeRevision } from './runtime-revision.js'

/** Captures one completed context, omitting failed/uncollected files from target lookup. */
export async function captureCatalogSnapshot(ctx: Context, options: SnapshotOptions, outcomes = new Map<string, StoryCollectionOutcome>()): Promise<Omit<CatalogSnapshot, 'revision'>> {
  const diagnostics: CatalogDiagnostic[] = []
  const contents = new Map<string, StoryContentEntry>()
  const stories: CatalogStory[] = []
  let failedFiles = 0
  let validOutcomes = 0
  // Clone the entire metadata projection before awaiting file reads. A later
  // queued collector batch cannot leak partially mutated runtime objects.
  const files = ctx.storyFiles.map(file => ({ ...file, treePath: file.treePath?.slice(), story: file.story && { ...file.story, layout: file.story.layout && { ...file.story.layout }, matrix: normalizeHistoireMatrixHint(file.story.matrix), variants: (file.story.variants ?? []).map(v => ({ id: v.id, title: v.title, ...(typeof v.icon === 'string' ? { icon: v.icon } : {}), ...(typeof (v as { hasTests?: boolean }).hasTests === 'boolean' ? { hasTests: (v as { hasTests?: boolean }).hasTests } : {}) })) }, markdownFile: file.markdownFile && { ...file.markdownFile } }))
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
      content = await indexStoryContent(ctx.root, file, { readText: options.readText, context: options.contentContext ?? ctx })
    }
    catch (error) {
      if (error instanceof CatalogContentChangedError) throw error
      content = { source: { kind: 'unavailable', reason: sanitizeDiagnosticMessage(error, ctx.root, options.secret) } }
    }
    if (content.source.kind === 'unavailable') diagnostics.push({ filePath: file.relativePath, storyId: file.story.id, code: 'SOURCE_UNAVAILABLE', message: sanitizeDiagnosticMessage(content.source.reason, ctx.root, options.secret) })
    if (content.docsUnavailableReason) diagnostics.push({ filePath: file.relativePath, storyId: file.story.id, code: 'DOCS_UNAVAILABLE', message: sanitizeDiagnosticMessage(content.docsUnavailableReason, ctx.root, options.secret) })
    if (outcome?.sourceSha256 && content.source.sha256 && outcome.sourceSha256 !== content.source.sha256) throw new CatalogContentChangedError('Source changed after story collection')
    const runtimeRevision = getStoryRuntimeRevision(content.source.sha256, file)
    const story: CatalogStory = {
      id: file.story.id,
      title: file.story.title,
      treePath: file.treePath ?? [file.story.title],
      filePath: file.relativePath.replace(/\\/g, '/'),
      supportPluginId: file.supportPluginId,
      ...(runtimeRevision ? { runtimeRevision } : {}),
      docsOnly: file.story.docsOnly === true,
      matrix: normalizeHistoireMatrixHint(file.story.matrix),
      variants: file.story.variants.map(variant => ({ id: variant.id, title: variant.title })),
      docsAvailable: !!content.docs,
      sourceAvailable: content.source.kind !== 'unavailable',
      sourceKind: content.source.kind,
      ...(file.story.group == null ? {} : { group: file.story.group }),
    }
    const invalid = options.validateStory?.(story) ?? (validStory(story) ? undefined : 'INVALID_METADATA')
    if (invalid) {
      diagnostics.push({ filePath: story.filePath, code: invalid, message: invalid === 'RESULT_TOO_LARGE' ? 'Story metadata exceeds response size limit' : 'Collected metadata contains invalid IDs or fields' })
      continue
    }
    stories.push(story)
    if (content.source.identity) Object.freeze(content.source.identity)
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
  const bounded = boundedDiagnostics(diagnostics, options.maxDiagnostics)
  const failed = failedFiles > 0 && validOutcomes === 0
  const catalog = projectCatalog(stories, bounded.diagnostics, files, ctx.config)
  const fingerprint = hashContent(JSON.stringify({ catalog, stories, ...bounded, failed, content: [...contents].map(([file, entry]) => [file, entry.source.sha256, entry.source.reason, entry.docsUnavailableReason, entry.docs?.sha256, entry.docs?.physicalSha256, entry.docs?.html]) }))
  const outcome = failed ? 'failed' : diagnostics.length > 0 ? 'partial' : 'success'
  return { catalog, outcome, projectId: options.projectId, epoch: options.epoch, stories: Object.freeze(stories), ...bounded, failed, contents: immutableMap(contents), fingerprint }
}
