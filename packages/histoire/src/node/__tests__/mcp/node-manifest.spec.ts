import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createArtifactManifest } from '../../build/node/manifest.js'
import { captureNodeBuildInputs, createNodeBuildSnapshot } from '../../build/node/snapshot.js'
import { artifactManifestSchema, artifactStoragePathSchema } from '../../deploy/artifact-schema.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../utils/mcp/project.js'

describe('portable Node manifest', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  /** Creates explicit settings consumed by the artifact, never arbitrary config. */
  function context(files = [createMcpStory(fixture.root)]) {
    const ctx = createMcpContext(fixture.root, files)
    ctx.config = { theme: { title: 'Book', defaultColorScheme: 'auto' }, routerMode: 'history', mcp: false, build: { node: { includeSource: true } }, test: { collectTimeout: 100, storyCollectTimeout: 20, runTimeout: 200 } } as any
    ctx.resolvedViteConfig = { base: '/book/' }
    return ctx
  }

  it('preserves exact IDs/docs/source and strips private runtime/config fields', async () => {
    const file = createMcpStory(fixture.root, '../🐈/%2E')
    file.story.docsText = 'Inline docs\r\n'
    file.story.meta = { secret: 'do not include' }
    const ctx = context([file])
    ctx.config.backgroundPresets = [{ label: 'Initial', color: '#123456' }]
    const snapshot = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    const manifest = createArtifactManifest(snapshot, [{ path: 'index.html', sha256: 'a'.repeat(64), bytes: 10 }], true, '1.2.3')
    expect(artifactManifestSchema.parse(manifest)).toEqual(manifest)
    expect(manifest.stories[0]).toMatchObject({ story: { id: '../🐈/%2E', docsAvailable: true, sourceKind: 'virtual' }, source: { kind: 'virtual' }, docs: { kind: 'text', origin: 'collected' } })
    const serialized = JSON.stringify(manifest)
    expect(serialized).not.toContain(fixture.root)
    expect(serialized).not.toContain('do not include')
    expect(manifest).toMatchObject({ base: '/book/', backgroundColor: '#123456', mcpEnabled: false, testRuntimeIncluded: true, histoireVersion: '1.2.3', timeouts: { collect: 100, storyCollect: 20, run: 200 } })
    expect(manifest.buildId).toBe(createArtifactManifest(snapshot, manifest.publicAssets, true, '1.2.3').buildId)
    expect(createArtifactManifest(snapshot, [{ ...manifest.publicAssets[0], bytes: 11 }], true, '1.2.3').buildId).not.toBe(manifest.buildId)
    expect(createArtifactManifest({ ...snapshot, settings: { ...snapshot.settings, backgroundColor: '#ffffff' } }, manifest.publicAssets, true, '1.2.3').buildId).not.toBe(manifest.buildId)
  })

  it('omits private raw source while retaining collected docs and UI source input', async () => {
    const ctx = context()
    ctx.storyFiles[0].story.docsText = 'docs'
    ctx.config.build.node.includeSource = false
    const original = ctx.storyFiles[0].moduleCode
    const snapshot = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    expect(snapshot.stories[0]).toMatchObject({ story: { sourceAvailable: false, sourceKind: 'unavailable', docsAvailable: true }, source: { kind: 'unavailable', reason: 'Source excluded from Node artifact' } })
    expect(ctx.storyFiles[0].moduleCode).toBe(original)
    expect([...snapshot.blobs.values()]).toEqual(['docs'])
  })

  it('fails source edits between collection boundaries without publishing mixed data', async () => {
    const file = await fixture.physical('first\n')
    const ctx = context([file])
    const inputs = await captureNodeBuildInputs(ctx)
    await writeFile(file.path, 'second\n')
    await expect(createNodeBuildSnapshot(ctx, inputs)).rejects.toThrow('Build content changed: a.story.js')
  })

  it('captures Markdown without arbitrary frontmatter and detects frontmatter edits', async () => {
    const ctx = context()
    const path = join(fixture.root, 'a.md')
    await writeFile(path, '---\ntitle: A\nprivate: hidden\n---\n# Docs\n')
    ctx.storyFiles[0].markdownFile = { id: 'md', relativePath: 'a.md', absolutePath: path, content: '# Docs\n', frontmatter: { title: 'A', private: 'hidden' }, isRelatedToStory: true }
    const inputs = await captureNodeBuildInputs(ctx)
    const snapshot = await createNodeBuildSnapshot(ctx, inputs)
    expect(snapshot.stories[0].docs).toMatchObject({ kind: 'markdown', origin: 'sibling', filePath: 'a.md' })
    expect(JSON.stringify(snapshot.stories)).not.toContain('hidden')
    await writeFile(path, '---\ntitle: B\n---\n# Docs\n')
    await expect(createNodeBuildSnapshot(ctx, inputs)).rejects.toThrow('Build content changed: a.story.js')
  })

  it.each(['../private/x', './x', '/etc/passwd', 'a/../b', 'a\\b', 'a//b', 'C:/x', 'a/./b'])('rejects unsafe storage path %s', (path) => {
    expect(artifactStoragePathSchema.safeParse(path).success).toBe(false)
  })
})
