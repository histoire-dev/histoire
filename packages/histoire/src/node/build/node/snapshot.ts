import type { Context } from '../../context.js'
import type { ArtifactManifest, ArtifactStory } from '../../deploy/artifact-schema.js'
import type { StoryContentEntry } from '../../mcp/project/content-index.js'
import { Buffer } from 'node:buffer'
import { normalizeNodeBase } from '../../deploy/base.js'
import { hashContent } from '../../mcp/project/content-hash.js'
import { indexStoryContent, readRegisteredText } from '../../mcp/project/content-index.js'
import { captureCatalogSnapshot } from '../../mcp/project/snapshot.js'
import { getCollectTimeout, getRunTimeout, getStoryCollectTimeout } from '../../util/test-timeouts.js'

/** Pre-execution identities and bounded bytes, never serialized as project paths. */
export interface NodeBuildInput {
  /** Captured registered physical or virtual source. */
  source: StoryContentEntry['source']
  /** Raw source retained before collection, avoiding a later mixed snapshot. */
  sourceText?: string
  /** Physical Markdown identity includes frontmatter that affects collected metadata. */
  docsPhysicalSha256?: string
}

/** Only static settings and content used by the portable artifact writer. */
export interface NodeBuildSnapshot {
  /** Explicit collected metadata/content projection. */
  stories: ArtifactStory[]
  /** Digest-named private content deduplicated across all stories. */
  blobs: Map<string, string>
  /** Allowlisted settings, diagnostics, and timeouts. */
  settings: Pick<ArtifactManifest, 'title' | 'base' | 'routerMode' | 'defaultColorScheme' | 'backgroundColor' | 'textDirection' | 'globals' | 'mcpEnabled' | 'timeouts' | 'diagnostics' | 'diagnosticsTruncated'>
}

/** Captures source/docs before executing stories or any build-time test collection. */
export async function captureNodeBuildInputs(ctx: Context): Promise<Map<string, NodeBuildInput>> {
  const result = new Map<string, NodeBuildInput>()
  for (const file of ctx.storyFiles) {
    const content = await indexStoryContent(ctx.root, file)
    let sourceText = content.source.text
    if (content.source.kind === 'file') {
      const captured = await readRegisteredText(ctx.root, file.path)
      if (captured.sha256 !== content.source.sha256) throw new Error(`Build content changed: ${file.relativePath}`)
      sourceText = captured.text
    }
    result.set(file.relativePath.replace(/\\/g, '/'), { source: content.source, sourceText, docsPhysicalSha256: content.docs?.physicalSha256 })
  }
  return result
}

/** Captures collected metadata only when registered bytes still match the pre-execution capture. */
export async function createNodeBuildSnapshot(ctx: Context, inputs: ReadonlyMap<string, NodeBuildInput>): Promise<NodeBuildSnapshot> {
  for (const file of ctx.storyFiles) {
    const before = inputs.get(file.relativePath.replace(/\\/g, '/'))
    if (!before) throw new Error(`Build content changed: ${file.relativePath}`)
    try {
      const after = await indexStoryContent(ctx.root, file)
      if (after.source.kind !== before.source.kind || after.source.sha256 !== before.source.sha256 || after.docs?.physicalSha256 !== before.docsPhysicalSha256) throw new Error('changed')
    }
    catch { throw new Error(`Build content changed: ${file.relativePath}`) }
  }
  const captured = await captureCatalogSnapshot(ctx, { projectId: 'build', epoch: 'build' })
  const blobs = new Map<string, string>()
  /** Stores one exact UTF-8 blob and reuses identical source/docs content. */
  function blob(text: string) {
    const sha256 = hashContent(text)
    const path = `content/${sha256}.txt`
    blobs.set(path, text)
    return { path, sha256, bytes: Buffer.byteLength(text) }
  }
  const stories = captured.stories.map((metadata): ArtifactStory => {
    const content = captured.contents.get(metadata.filePath)
    const before = inputs.get(metadata.filePath)
    if (!before || content.source.kind !== before.source.kind || content.source.sha256 !== before.source.sha256 || content.docs?.physicalSha256 !== before.docsPhysicalSha256) throw new Error(`Build content changed: ${metadata.filePath}`)
    const includeSource = ctx.config.build?.node?.includeSource !== false
    const available = includeSource && before.source.kind !== 'unavailable'
    if (available && before.sourceText == null) throw new Error(`Build source capture is missing: ${metadata.filePath}`)
    const story = { ...metadata, sourceAvailable: available, sourceKind: available ? before.source.kind : 'unavailable' } as ArtifactStory['story']
    const source: ArtifactStory['source'] = available
      ? { kind: before.source.kind as 'file' | 'virtual', ...blob(before.sourceText) }
      : { kind: 'unavailable', reason: includeSource ? 'Registered source is unavailable' : 'Source excluded from Node artifact' }
    const docs = content.docs && { ...blob(content.docs.text), kind: content.docs.kind, origin: content.docs.origin, ...(content.docs.filePath == null ? {} : { filePath: content.docs.filePath }) }
    return { story, source, ...(docs ? { docs } : {}) }
  })
  const mcp = ctx.config.mcp
  return {
    stories,
    blobs,
    settings: {
      title: ctx.config.theme?.title ?? 'Histoire',
      base: normalizeNodeBase(ctx.resolvedViteConfig.base ?? '/'),
      routerMode: ctx.config.routerMode ?? 'history',
      defaultColorScheme: ctx.config.theme?.defaultColorScheme ?? 'auto',
      backgroundColor: ctx.config.backgroundPresets?.[0]?.color ?? 'transparent',
      textDirection: ctx.config.preview?.textDirection ?? 'ltr',
      globals: { ...ctx.config.preview?.globals },
      mcpEnabled: mcp !== false && (typeof mcp !== 'object' || mcp.enabled !== false),
      timeouts: { collect: getCollectTimeout(ctx), storyCollect: getStoryCollectTimeout(ctx), run: getRunTimeout(ctx) },
      diagnostics: captured.diagnostics.slice(),
      diagnosticsTruncated: captured.diagnosticsTruncated,
    },
  }
}
