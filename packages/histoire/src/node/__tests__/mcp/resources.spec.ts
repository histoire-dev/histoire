import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeMcpResourceUri } from '../../mcp/protocol/uris.js'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('mcp SDK resources', () => {
  const close: (() => Promise<unknown>)[] = []
  afterEach(async () => {
    await Promise.all(close.splice(0).reverse().map(fn => fn()))
  })
  /** Share SDK harness and actual catalog/content fixture with read tools. */
  async function fixture(ids?: string[]) {
    const value = await createReadProjectFixture(ids)
    close.push(value.close)
    const harness = await createMcpTestClient(() => createHistoireMcpServer({ project: value.project, principal: 'local', version: 'test-version' }))
    close.push(harness.close)
    return { ...value, client: harness.client }
  }

  it('lists finite project resource and three content templates without loading source', async () => {
    const { client, project } = await fixture()
    project.getSource = () => {
      throw new Error('discovery must not read content')
    }
    const listed = await client.listResources()
    expect(listed.resources.map(resource => resource.uri)).toEqual(['histoire://fixture-project/project'])
    const templates = await client.listResourceTemplates()
    expect(templates.resourceTemplates.map(template => template.name)).toEqual(['histoire_story', 'histoire_docs', 'histoire_source'])
    expect(JSON.stringify(listed)).not.toContain('raw source')
  })

  it.each(['.', '..', '%2E', '/雪 ?#%'])('reads exact hostile resource ID %s through actual SDK', async (storyId) => {
    const { client, catalog } = await fixture([storyId])
    for (const kind of ['story', 'docs', 'source'] as const) {
      const uri = encodeMcpResourceUri({ projectId: 'fixture-project', kind, storyId, revision: catalog.current.revision })
      const resource = await client.readResource({ uri })
      expect(resource.contents[0].uri).toBe(uri)
      const name = `histoire_get_${kind}`
      const tool = await client.callTool({ name, arguments: { storyId, expectedRevision: catalog.current.revision } })
      const data = (tool.structuredContent as any).data
      if (kind === 'story') {
        expect(JSON.parse(resource.contents[0].text as string)).toEqual(data)
      }
      else {
        const { text, ...metadata } = data
        expect(resource.contents[0]).toMatchObject({ mimeType: 'text/plain', text, _meta: metadata })
      }
    }
  })

  it('pages docs/source equivalently and rejects stale, foreign, aliased or missing resources', async () => {
    const { client, catalog } = await fixture()
    const revision = catalog.current.revision
    const uri = encodeMcpResourceUri({ projectId: 'fixture-project', kind: 'docs', storyId: 'story', revision, offset: 2, limit: 4 })
    const resource = (await client.readResource({ uri })).contents[0]
    const tool = await client.callTool({ name: 'histoire_get_docs', arguments: { storyId: 'story', offset: 2, limit: 4, expectedRevision: revision } })
    expect(resource.text).toBe((tool.structuredContent as any).data.text)
    expect(resource._meta).toMatchObject({ sha256: (tool.structuredContent as any).data.sha256, revision, offset: 2, nextOffset: 6 })
    for (const invalid of ['histoire://foreign/project', 'histoire://fixture-project/stories/%73tory', 'histoire://fixture-project/stories/missing', `${uri}&offset=0`, 'histoire://fixture-project/stories/story?revision=00000000-0000-4000-8000-000000000001%3A999']) {
      await expect(client.readResource({ uri: invalid })).rejects.toThrow()
    }
  })

  it('returns original Markdown as text with hash and paging metadata beside content', async () => {
    const { client, catalog, context } = await fixture()
    const text = '# Original Markdown\r\n\r\n🚀\r\n'
    const absolutePath = join(context.root, 'guide.md')
    await writeFile(absolutePath, text)
    context.storyFiles[0].markdownFile = { absolutePath, relativePath: 'guide.md', isRelatedToStory: true, frontmatter: {}, content: text } as any
    await catalog.publish(context)
    const uri = encodeMcpResourceUri({ projectId: 'fixture-project', kind: 'docs', storyId: 'story', revision: catalog.current.revision })
    const resource = (await client.readResource({ uri })).contents[0]
    expect(resource).toMatchObject({ uri, mimeType: 'text/markdown', text, _meta: { projectId: 'fixture-project', storyId: 'story', revision: catalog.current.revision, kind: 'markdown', origin: 'sibling', filePath: 'guide.md' } })
    expect(resource._meta.sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
