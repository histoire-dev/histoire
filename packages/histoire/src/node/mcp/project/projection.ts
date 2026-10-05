import type { CatalogSnapshot, CatalogStory } from '../../runtime/catalog/types.js'
import type { StoryContentEntry } from '../../runtime/content/types.js'
import { Buffer } from 'node:buffer'
import { boundedDiagnostics, sanitizeDiagnosticMessage } from '../../runtime/catalog/diagnostics.js'
import { immutableMap } from '../../runtime/catalog/immutable.js'
import { projectCatalog } from '../../runtime/catalog/projection.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { mcpStorySchema } from '../protocol/story-schema.js'
import { isPathWithinRoot, readRegisteredText } from './containment.js'

/** Removes known shared-only metadata before MCP validation, quotas, and publication. */
function projectStory(story: CatalogStory): Omit<CatalogStory, 'matrix' | 'runtimeRevision'> {
  const { matrix: _matrix, runtimeRevision: _runtimeRevision, ...projected } = story
  return projected
}

/** Existing metadata validation/size quotas remain MCP projection policy. */
function validateStory(story: CatalogStory): 'INVALID_METADATA' | 'RESULT_TOO_LARGE' | undefined {
  const projected = projectStory(story)
  if (!mcpStorySchema.safeParse(projected).success) return 'INVALID_METADATA'
  if (Buffer.byteLength(JSON.stringify(projected)) > MCP_LIMITS.responseBytes / 2) return 'RESULT_TOO_LARGE'
}

/** Shared capture supports direct compatibility callers without weakening access policy. */
export const mcpCapturePolicy = { readText: readRegisteredText, validateStory, maxDiagnostics: MCP_LIMITS.diagnostics }

/** Projects canonical registered handles into MCP containment without another read or collector. */
export function projectMcpSnapshot(snapshot: CatalogSnapshot, root: string, secret?: string): CatalogSnapshot
/** Projects compatibility captures before their owning provider assigns a revision. */
export function projectMcpSnapshot(snapshot: Omit<CatalogSnapshot, 'revision'>, root: string, secret?: string): Omit<CatalogSnapshot, 'revision'>
/** Preserves capture identity while projecting only MCP metadata and access policy. */
export function projectMcpSnapshot(snapshot: Omit<CatalogSnapshot, 'revision'>, root: string, secret?: string): Omit<CatalogSnapshot, 'revision'> {
  const stories: CatalogStory[] = []
  const contents = new Map<string, StoryContentEntry>()
  const diagnostics = snapshot.diagnostics.map(item => ({ ...item, message: sanitizeDiagnosticMessage(item.message, root, secret) }))
  for (const sharedStory of snapshot.stories) {
    const story = projectStory(sharedStory)
    const invalid = validateStory(story)
    if (invalid) {
      diagnostics.push({ filePath: story.filePath, code: invalid, message: invalid === 'RESULT_TOO_LARGE' ? 'Story metadata exceeds response size limit' : 'Collected metadata contains invalid IDs or fields' })
      continue
    }
    const entry = snapshot.contents.get(story.filePath)
    let source = entry.source
    let docs = entry.docs
    let docsUnavailableCode = entry.docsUnavailableCode
    if (source.absolutePath && !isPathWithinRoot(root, source.absolutePath)) {
      source = Object.freeze({ kind: 'unavailable', unavailableCode: 'PATH_OUTSIDE_ROOT', reason: 'Registered content is outside project root' })
      diagnostics.push({ storyId: story.id, filePath: story.filePath, code: 'SOURCE_UNAVAILABLE', message: source.reason })
    }
    if (docs?.absolutePath && !isPathWithinRoot(root, docs.absolutePath)) {
      docs = undefined
      docsUnavailableCode = 'PATH_OUTSIDE_ROOT'
      diagnostics.push({ storyId: story.id, filePath: story.filePath, code: 'DOCS_UNAVAILABLE', message: 'Registered content is outside project root' })
    }
    stories.push(Object.freeze({ ...story, sourceAvailable: source.kind !== 'unavailable', sourceKind: source.kind, docsAvailable: !!docs }))
    contents.set(story.filePath, Object.freeze({ ...entry, source, docs, docsUnavailableCode }))
  }
  const bounded = boundedDiagnostics(diagnostics)
  return Object.freeze({ ...snapshot, ...bounded, diagnosticsTruncated: snapshot.diagnosticsTruncated || bounded.diagnosticsTruncated, stories: Object.freeze(stories), contents: immutableMap(contents), catalog: projectCatalog(stories, bounded.diagnostics) })
}
