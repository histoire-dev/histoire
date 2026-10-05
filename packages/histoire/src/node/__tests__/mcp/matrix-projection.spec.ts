import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { captureNodeBuildInputs, createNodeBuildSnapshot } from '../../build/node/snapshot.js'
import { artifactStorySchema } from '../../deploy/artifact-schema.js'
import { createProjectCatalog } from '../../mcp/project/catalog.js'
import { mcpCapturePolicy } from '../../mcp/project/projection.js'
import { captureCatalogSnapshot } from '../../mcp/project/snapshot.js'
import { MCP_LIMITS } from '../../mcp/protocol/limits.js'
import { mcpStorySchema } from '../../mcp/protocol/story-schema.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('mcp matrix projection boundary', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it.each([undefined, { axes: { size: ['small', 'large'] } }])('retains shared matrix %j while returning exact MCP records', async (matrix) => {
    const file = createMcpStory(fixture.root)
    file.story.matrix = matrix
    const options = { ...MCP_PROJECT_OPTIONS, root: fixture.root }
    const provider = createRuntimeCatalog(options)
    await provider.publish(createMcpContext(fixture.root, [file]))
    const sharedStory = provider.current.stories[0]
    expect(Object.hasOwn(sharedStory, 'matrix')).toBe(true)
    expect(sharedStory.matrix).toEqual(matrix)
    expect(provider.current.catalog.stories[0].matrix).toEqual(matrix)
    const { matrix: _matrix, runtimeRevision: _runtimeRevision, ...expected } = sharedStory
    const catalog = createProjectCatalog({ ...options, provider })
    const listed = catalog.list({}).items[0]
    expect(listed).toStrictEqual(expected)
    expect(catalog.getStory(file.id).story).toStrictEqual(expected)
    expect(mcpStorySchema.safeParse(listed).success).toBe(true)
    expect(Object.hasOwn(listed, 'matrix')).toBe(false)
    expect(Object.hasOwn(listed, 'runtimeRevision')).toBe(false)
    expect(provider.current.stories[0]).toBe(sharedStory)
    expect(sharedStory.matrix).toEqual(matrix)
  })

  it('retains changed shared runtime revisions without adding them to MCP records', async () => {
    const file = createMcpStory(fixture.root)
    const ctx = createMcpContext(fixture.root, [file])
    const options = { ...MCP_PROJECT_OPTIONS, root: fixture.root }
    const provider = createRuntimeCatalog(options)
    await provider.publish(ctx)
    const before = provider.current.stories[0].runtimeRevision
    expect(before).toMatch(/^[a-f0-9]{64}$/)
    const catalog = createProjectCatalog({ ...options, provider })
    expect(Object.hasOwn(catalog.getStory(file.id).story, 'runtimeRevision')).toBe(false)
    file.moduleCode = 'export default { changed: true }'
    await provider.publish(ctx)
    const after = provider.current.stories[0].runtimeRevision
    expect(after).not.toBe(before)
    expect(provider.current.catalog.stories[0].runtimeRevision).toBe(after)
    const listed = catalog.list({}).items[0]
    expect(mcpStorySchema.safeParse(listed).success).toBe(true)
    expect(Object.hasOwn(listed, 'runtimeRevision')).toBe(false)
  })

  it('measures only MCP fields while retaining strict validation of unknown fields', async () => {
    const file = createMcpStory(fixture.root)
    file.story.matrix = { axes: { description: ['x'.repeat(70 * 1024)] } }
    const options = { ...MCP_PROJECT_OPTIONS, root: fixture.root }
    const provider = createRuntimeCatalog(options)
    await provider.publish(createMcpContext(fixture.root, [file]))
    const sharedStory = provider.current.stories[0]
    expect(Buffer.byteLength(JSON.stringify(sharedStory))).toBeGreaterThan(MCP_LIMITS.responseBytes / 2)
    expect(mcpCapturePolicy.validateStory(sharedStory)).toBeUndefined()
    expect(mcpCapturePolicy.validateStory({ ...sharedStory, title: 'x'.repeat(70 * 1024) })).toBe('RESULT_TOO_LARGE')
    expect(mcpCapturePolicy.validateStory({ ...sharedStory, unknown: true } as typeof sharedStory)).toBe('INVALID_METADATA')
    const catalog = createProjectCatalog({ ...options, provider })
    expect(catalog.list({}).items).toHaveLength(1)
    expect(Buffer.byteLength(JSON.stringify(catalog.list({})))).toBeLessThan(MCP_LIMITS.responseBytes)
    expect(sharedStory.matrix).toEqual(file.story.matrix)
  })

  it('keeps defined hints out of compatibility capture and private Node artifact records', async () => {
    const file = createMcpStory(fixture.root)
    const matrix = { axes: { size: ['small', 'large'] } }
    file.story.matrix = matrix
    const ctx = createMcpContext(fixture.root, [file])
    const captured = await captureCatalogSnapshot(ctx, MCP_PROJECT_OPTIONS)
    expect(captured.stories).toHaveLength(1)
    expect(Object.hasOwn(captured.stories[0], 'matrix')).toBe(false)
    expect(Object.hasOwn(captured.stories[0], 'runtimeRevision')).toBe(false)
    expect(mcpStorySchema.safeParse(captured.stories[0]).success).toBe(true)
    const output = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    expect(output.stories).toHaveLength(1)
    expect(artifactStorySchema.safeParse(output.stories[0]).success).toBe(true)
    expect(Object.hasOwn(output.stories[0].story, 'matrix')).toBe(false)
    expect(Object.hasOwn(output.stories[0].story, 'runtimeRevision')).toBe(false)
    expect(file.story.matrix).toEqual(matrix)
    const provider = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await provider.publish(ctx)
    expect(provider.current.catalog.stories[0].matrix).toEqual(matrix)
  })
})
