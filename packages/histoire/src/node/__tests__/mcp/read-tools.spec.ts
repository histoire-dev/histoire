import { afterEach, describe, expect, it } from 'vitest'
import { McpDomainError } from '../../mcp/protocol/errors.js'
import { mcpToolOutputSchemas } from '../../mcp/protocol/tool-schema.js'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { MCP_READ_TOOLS } from '../../mcp/server/read-tools.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('mcp SDK read tools', () => {
  const close: (() => Promise<unknown>)[] = []
  afterEach(async () => {
    await Promise.all(close.splice(0).reverse().map(fn => fn()))
  })
  /** Use official client with real immutable catalog and content services. */
  async function fixture(ids?: string[]) {
    const value = await createReadProjectFixture(ids)
    close.push(value.close)
    const harness = await createMcpTestClient(() => createHistoireMcpServer({ project: value.project, principal: 'local', version: 'test-version' }))
    close.push(harness.close)
    return { ...value, client: harness.client }
  }

  it('discovers exactly six reads, strict schemas, and read-only annotations', async () => {
    const { client } = await fixture()
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).sort()).toEqual([...MCP_READ_TOOLS].sort())
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(tool.outputSchema).toBeDefined()
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
    }
    expect(client.getServerVersion()).toEqual({ name: 'histoire', version: 'test-version' })
    expect(client.getServerCapabilities()).toMatchObject({ tools: { listChanged: false }, resources: { listChanged: false } })
  })

  it('validates published outputs and preserves exact scoped IDs without private metadata', async () => {
    const { client } = await fixture(['story/? #%', 'other'])
    const inputs = {
      histoire_get_project: {},
      histoire_list_stories: {},
      histoire_get_story: { storyId: 'story/? #%' },
      histoire_get_docs: { storyId: 'story/? #%', offset: 0, limit: 12 },
      histoire_get_source: { storyId: 'story/? #%', startLine: 1, lineCount: 1 },
      histoire_get_preview: { storyId: 'story/? #%', variantId: 'shared/? #%' },
    }
    for (const name of MCP_READ_TOOLS) {
      const result = await client.callTool({ name, arguments: inputs[name] })
      expect(result.isError).not.toBe(true)
      expect(mcpToolOutputSchemas[name].safeParse(result.structuredContent).success).toBe(true)
      expect(result.content[0]).toMatchObject({ type: 'text', text: JSON.stringify(result.structuredContent) })
      expect(JSON.stringify(result)).not.toContain('not public')
    }
  })

  it('reports domain failures and rejects malformed arguments before reading', async () => {
    const { client, project } = await fixture()
    const missing = await client.callTool({ name: 'histoire_get_story', arguments: { storyId: 'missing' } })
    expect(missing).toMatchObject({ isError: true, structuredContent: { ok: false, error: { code: 'STORY_NOT_FOUND' } } })
    expect(mcpToolOutputSchemas.histoire_get_story.safeParse(missing.structuredContent).success).toBe(true)
    const invalid = await client.callTool({ name: 'histoire_get_source', arguments: { storyId: 'story', path: '/etc/passwd' } })
    expect(invalid.isError).toBe(true)
    project.getSource = () => {
      throw new Error('private /absolute/path token-value')
    }
    const internal = await client.callTool({ name: 'histoire_get_source', arguments: { storyId: 'story' } })
    expect(internal).toMatchObject({ isError: true, structuredContent: { error: { code: 'INTERNAL_ERROR', message: 'Internal Histoire MCP error' } } })
    project.getDocs = () => {
      throw new McpDomainError('PROJECT_RESTARTING', 'Project runtime is restarting', true)
    }
    const restarting = await client.callTool({ name: 'histoire_get_docs', arguments: { storyId: 'story' } })
    expect(restarting).toMatchObject({ structuredContent: { error: { code: 'PROJECT_RESTARTING', retryable: true } } })
  })

  it('distinguishes a completed empty catalog from failed collection', async () => {
    const { client, catalog, context } = await fixture([])
    const empty = await client.callTool({ name: 'histoire_list_stories', arguments: {} })
    expect(empty).toMatchObject({ structuredContent: { ok: true, data: { items: [], total: 0 } } })
    context.storyFiles = [{ id: 'broken', path: `${context.root}/broken.js`, relativePath: 'broken.js' } as any]
    await catalog.publish(context, new Map([[context.storyFiles[0].path, { status: 'failed', error: new Error('broken') }]]))
    const failure = await client.callTool({ name: 'histoire_get_story', arguments: { storyId: 'broken' } })
    expect(failure).toMatchObject({ structuredContent: { error: { code: 'COLLECTION_FAILED' } } })
  })
})
