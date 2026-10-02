import type { Context } from '../../context.js'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectCatalog } from '../../mcp/project/catalog.js'
import { CatalogContentChangedError, hashContent, readRegisteredText } from '../../mcp/project/content-index.js'
import { mcpListStoriesResultSchema } from '../../mcp/protocol/project-schema.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../utils/mcp/project.js'

describe('catalog content freshness', () => {
  let root: string
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
    root = fixture.root
  })
  afterEach(async () => {
    await fixture.close()
  })

  /** Builds a single virtual story with optional registered Markdown docs. */
  function context(markdown?: any): Context {
    const file = createMcpStory(root, 'story', 'a.js', [{ id: 'v', title: 'Variant' }])
    file.markdownFile = markdown
    const ctx = createMcpContext(root, [file])
    ctx.markdownFiles = markdown ? [markdown] : []
    return ctx
  }

  it('rejects stale Markdown parsing and retains the previous completed snapshot', async () => {
    const absolutePath = join(root, 'a.story.md')
    await writeFile(absolutePath, '---\ntitle: Initial\n---\nOriginal\n')
    const markdown = { id: 'md', relativePath: 'a.story.md', absolutePath, isRelatedToStory: true, frontmatter: { title: 'Initial' }, content: 'Original\n' }
    const ctx = context(markdown)
    const catalog = createProjectCatalog({ root, projectId: 'project', epoch: '00000000-0000-4000-8000-000000000001' })
    await catalog.publish(ctx)
    const original = catalog.current
    await writeFile(absolutePath, '---\ntitle: Changed\n---\nOriginal\n')
    catalog.markUpdating()
    await expect(catalog.publish(ctx)).rejects.toBeInstanceOf(CatalogContentChangedError)
    expect(catalog.current).toBe(original)
    expect(catalog.updating).toBe(true)
    markdown.frontmatter.title = 'Changed'
    await catalog.publish(ctx)
    expect(catalog.current.revision).not.toBe(original.revision)
    expect(catalog.current.contents.get('a.js').docs.text).toBe('Original\n')
  })

  it('keeps valid metadata when docs become unavailable and rejects external symlinks', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'histoire-outside-'))
    try {
      await writeFile(join(outside, 'secret.txt'), 'secret')
      const absolutePath = join(root, 'a.story.md')
      await symlink(join(outside, 'secret.txt'), absolutePath)
      await expect(readRegisteredText(root, absolutePath)).rejects.toThrow('outside project root')
      const ctx = context({ id: 'md', relativePath: 'a.story.md', absolutePath, isRelatedToStory: true, frontmatter: {}, content: 'secret' })
      const catalog = createProjectCatalog({ root, projectId: 'project', epoch: '00000000-0000-4000-8000-000000000001' })
      await catalog.publish(ctx)
      expect(catalog.list({}).items[0]).toMatchObject({ sourceAvailable: true, docsAvailable: false })
      expect(catalog.current.diagnostics[0].code).toBe('DOCS_UNAVAILABLE')
      expect(JSON.stringify(catalog.list({}))).not.toContain('secret')
    }
    finally { await rm(outside, { recursive: true, force: true }) }
  })

  it('rejects invalid UTF-8 and oversized physical sources before indexing', async () => {
    const file = join(root, 'source')
    await writeFile(file, Buffer.from([0xC0, 0xAF]))
    await expect(readRegisteredText(root, file)).rejects.toThrow()
    await writeFile(file, Buffer.alloc(2 * 1024 * 1024 + 1))
    await expect(readRegisteredText(root, file)).rejects.toThrow('bounded')
  })

  it('defers metadata collected from old source until matching source is recollected', async () => {
    const ctx = context()
    const file = ctx.storyFiles[0]
    const catalog = createProjectCatalog({ root, projectId: 'project', epoch: '00000000-0000-4000-8000-000000000001' })
    const collectedHash = hashContent(file.moduleCode)
    await catalog.publish(ctx, new Map([[file.path, { status: 'collected', sourceSha256: collectedHash }]]))
    const original = catalog.current
    file.moduleCode = 'export default { changed: true }'
    catalog.markUpdating()
    await expect(catalog.publish(ctx, new Map([[file.path, { status: 'collected', sourceSha256: collectedHash }]]))).rejects.toBeInstanceOf(CatalogContentChangedError)
    expect(catalog.current).toBe(original)
    expect(catalog.updating).toBe(true)
    await catalog.publish(ctx, new Map([[file.path, { status: 'collected', sourceSha256: hashContent(file.moduleCode) }]]))
    expect(catalog.current.revision).not.toBe(original.revision)
  })

  it('lists outside-root registered metadata safely with source unavailable', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'histoire-outside-'))
    try {
      const file = join(outside, 'external.story.js')
      await writeFile(file, 'secret')
      const ctx = context()
      Object.assign(ctx.storyFiles[0], { virtual: false, path: file, relativePath: '../external.story.js' })
      const catalog = createProjectCatalog({ root, projectId: 'project', epoch: '00000000-0000-4000-8000-000000000001' })
      await catalog.publish(ctx)
      const page = catalog.list({})
      expect(page.items[0]).toMatchObject({ filePath: '../external.story.js', sourceAvailable: false, sourceKind: 'unavailable' })
      expect(mcpListStoriesResultSchema.safeParse(page).success).toBe(true)
      expect(JSON.stringify(page)).not.toContain('secret')
    }
    finally { await rm(outside, { recursive: true, force: true }) }
  })
})
