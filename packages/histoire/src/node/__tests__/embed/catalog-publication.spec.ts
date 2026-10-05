import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('completed runtime catalog publication', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('publishes detached immutable metadata/content together and observes only changed batches', async () => {
    const file = createMcpStory(fixture.root)
    const ctx = createMcpContext(fixture.root, [file])
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    const publications: unknown[] = []
    const off = catalog.subscribe(value => publications.push(value))
    await catalog.publish(ctx)
    const original = catalog.current
    file.story.title = 'Changed'
    file.moduleCode = 'export default { changed: true }'
    catalog.markUpdating()
    expect(catalog.current).toBe(original)
    expect(original.catalog.stories[0].title).toBe('A')
    expect(() => (original.contents as Map<string, unknown>).clear()).toThrow()
    expect(Object.isFrozen(original.catalog.tree)).toBe(true)
    await catalog.publish(ctx)
    expect(catalog.current.revision).not.toBe(original.revision)
    expect(catalog.current.catalog.stories[0].title).toBe('Changed')
    expect(catalog.current.catalog.tree[0]).toMatchObject({ kind: 'folder', children: [{ kind: 'story', storyId: file.story.id }] })
    await catalog.publish(ctx)
    expect(publications).toHaveLength(2)
    off()
  })

  it('distinguishes successful empty, partial and failed batches and rejects ambiguous exact IDs', async () => {
    const files = [createMcpStory(fixture.root, 'a', 'a.js'), createMcpStory(fixture.root, 'b', 'b.js')]
    const ctx = createMcpContext(fixture.root, files)
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await catalog.publish(ctx, new Map([[files[0].path, { status: 'collected' }], [files[1].path, { status: 'failed', error: 'broken' }]]))
    expect(catalog.current.outcome).toBe('partial')
    expect(catalog.current.catalog.stories.map(file => file.id)).toEqual(['a'])
    await catalog.publish(ctx, new Map(files.map(file => [file.path, { status: 'failed', error: 'broken' }])))
    expect(catalog.current.outcome).toBe('failed')
    await catalog.publish(createMcpContext(fixture.root))
    expect(catalog.current.outcome).toBe('success')
    expect(catalog.current.catalog.stories).toEqual([])
    files[1].story.id = 'a'
    await catalog.publish(ctx)
    expect(() => catalog.getStory('a')).toThrowError(expect.objectContaining({ code: 'STORY_AMBIGUOUS' }))
  })

  it('does not publish hashing work from closed generation', async () => {
    let active = true
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root, isActive: () => active })
    const ctx = createMcpContext(fixture.root, [await fixture.physical('source')])
    const pending = catalog.publish(ctx)
    active = false
    await pending
    expect(catalog.current).toBeUndefined()
  })
})
