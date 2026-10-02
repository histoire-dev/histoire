import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectCatalog } from '../../mcp/project/catalog.js'
import { mcpListStoriesResultSchema } from '../../mcp/protocol/project-schema.js'

import { createMcpContext as context, createMcpProjectFixture, MCP_PROJECT_OPTIONS, createMcpStory as story } from '../utils/mcp/project.js'

const { projectId, epoch } = MCP_PROJECT_OPTIONS

describe('project catalog', () => {
  let root: string
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
    root = fixture.root
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('publishes detached snapshots and excludes runtime state and arbitrary metadata', async () => {
    const file = story(root)
    file.story.meta = { secret: 'omit' }
    file.story.variants[0].state = { secret: 'omit' }
    const catalog = createProjectCatalog({ projectId, epoch, root })
    await catalog.publish(context(root, [file]))
    file.story.title = 'Changed midway'
    file.story.variants.push({ id: 'later', title: 'Later' })
    catalog.markUpdating()
    const page = catalog.list({})
    expect(page.updating).toBe(true)
    expect(page.items[0]).toEqual({ id: 'story-a', title: 'A', treePath: ['Folder', 'A'], filePath: 'a.story.js', supportPluginId: 'vue', docsOnly: false, variants: [{ id: 'default', title: 'Default' }], docsAvailable: false, sourceAvailable: true, sourceKind: 'virtual' })
    expect(JSON.stringify(page)).not.toContain('secret')
    await catalog.publish(context(root, [file]))
    expect(catalog.list({}).items[0].title).toBe('Changed midway')
    expect(catalog.list({}).updating).toBe(false)
  })

  it('distinguishes empty and failed collection and recovers without stale executable targets', async () => {
    const file = story(root)
    const ctx = context(root, [file])
    const catalog = createProjectCatalog({ projectId, epoch, root })
    await catalog.publish(ctx)
    const revision = catalog.current.revision
    await catalog.publish(ctx, new Map([[file.path, { status: 'failed', error: new Error(`broken ${root}/secret`) }]]))
    expect(catalog.current.failed).toBe(true)
    expect(catalog.list({}).items).toEqual([])
    expect(() => catalog.getTarget('story-a', 'default')).toThrow(/collection/i)
    expect(JSON.stringify(catalog.current.diagnostics)).not.toContain(root)
    await catalog.publish(ctx, new Map([[file.path, { status: 'empty' }]]))
    expect(catalog.current.failed).toBe(false)
    expect(catalog.list({}).items).toEqual([])
    await catalog.publish(ctx, new Map([[file.path, { status: 'collected' }]]))
    expect(catalog.getTarget('story-a', 'default').story.id).toBe('story-a')
    expect(catalog.current.revision).not.toBe(revision)
  })

  it('rejects duplicate exact story or scoped variant identities while preserving hostile IDs', async () => {
    const files = [story(root, '..', 'a.js'), story(root, '..', 'b.js'), story(root, 'other', 'c.js', [{ id: '/', title: 'One' }, { id: '/', title: 'Two' }])]
    const catalog = createProjectCatalog({ projectId, epoch, root })
    await catalog.publish(context(root, files))
    expect(catalog.list({}).items.map(s => s.id)).toEqual(['..', '..', 'other'])
    expect(() => catalog.getStory('..')).toThrow(/ambiguous/i)
    expect(() => catalog.getTarget('other', '/')).toThrow(/ambiguous/i)
    expect(catalog.current.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['STORY_AMBIGUOUS', 'VARIANT_AMBIGUOUS']))
  })

  it('keeps pagination within one snapshot and rejects changed filters, foreign and expired cursors', async () => {
    let now = 0
    const options = { projectId, epoch, root, now: () => now }
    const catalog = createProjectCatalog(options)
    const ctx = context(root, [story(root, 'a', 'a.js'), story(root, 'b', 'b.js'), story(root, 'c', 'c.js')])
    await catalog.publish(ctx)
    const first = catalog.list({ pageSize: 1 })
    ctx.storyFiles.shift()
    await catalog.publish(ctx)
    expect(catalog.list({ pageSize: 1, cursor: first.nextCursor }).items[0].id).toBe('b')
    expect(() => catalog.list({ pageSize: 1, query: 'other', cursor: first.nextCursor })).toThrow(/cursor/i)
    const other = createProjectCatalog(options)
    await other.publish(ctx)
    expect(() => other.list({ pageSize: 1, cursor: first.nextCursor })).toThrow(/cursor/i)
    now = 60_001
    expect(() => catalog.list({ pageSize: 1, cursor: first.nextCursor })).toThrow(/expired/i)
  })

  it('changes revision and source hash on physical source edits with unchanged metadata', async () => {
    const file = story(root)
    file.virtual = false
    await writeFile(file.path, 'first\n')
    const catalog = createProjectCatalog({ projectId, epoch, root })
    const ctx = context(root, [file])
    await catalog.publish(ctx)
    const old = catalog.current
    await writeFile(file.path, 'second\n')
    await catalog.publish(ctx)
    expect(catalog.current.revision).not.toBe(old.revision)
    expect(catalog.current.contents.get(file.relativePath).source.sha256).not.toBe(old.contents.get(file.relativePath).source.sha256)
    expect(() => catalog.getStory(file.id, old.revision)).toThrow(/revision/i)
  })

  it('caps aggregate diagnostics and reports oversized metadata without breaking list responses', async () => {
    const files = Array.from({ length: 100 }, (_, index) => story(root, `failed-${index}`, `${index}.js`))
    const outcomes = new Map(files.map(file => [file.path, { status: 'failed' as const, error: new Error('x'.repeat(4096)) }]))
    const catalog = createProjectCatalog({ projectId, epoch, root })
    await catalog.publish(context(root, files), outcomes)
    const page = catalog.list({})
    expect(page.diagnosticsTruncated).toBe(true)
    expect(page.diagnostics.length).toBeLessThan(100)
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(128 * 1024)
    const oversized = story(root)
    oversized.story.title = 'x'.repeat(70 * 1024)
    await catalog.publish(context(root, [oversized]))
    expect(catalog.list({}).items).toEqual([])
    expect(catalog.current.diagnostics[0].code).toBe('RESULT_TOO_LARGE')
  })

  it('keeps diagnostics valid when collected metadata has invalid paths or IDs', async () => {
    const files = [story(root), story(root, '', 'b.js')]
    files[0].relativePath = root
    files[1].relativePath = ''
    const catalog = createProjectCatalog({ projectId, epoch, root })
    await catalog.publish(context(root, files))
    const page = catalog.list({})
    expect(mcpListStoriesResultSchema.safeParse(page).success).toBe(true)
    expect(page.items).toEqual([])
    expect(page.diagnostics).toEqual(expect.arrayContaining([
      { code: 'INVALID_METADATA', message: 'Collected metadata contains invalid IDs or fields' },
    ]))
    expect(JSON.stringify(page)).not.toContain(root)
  })
})
