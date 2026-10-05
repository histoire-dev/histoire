import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachRuntimeCatalog } from '../../runtime/catalog/attachment.js'
import { prepareLocalSourceOutput, writeLocalSourceDescriptor } from '../../virtual/embed/local-output.js'
import { createEmbedMiddleware } from '../../virtual/embed/middleware.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('standalone local source with public embedding disabled', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
    fixture.context.config.embed = { enabled: false }
  })
  afterEach(() => fixture.close())

  it('emits lazy local content and immutable descriptor without opening embed documents', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog, 'local')
    await prepareLocalSourceOutput(source, fixture.root)
    const descriptor = await writeLocalSourceDescriptor(fixture.context, source, fixture.root, 'immutable-build')
    expect(descriptor).toMatchObject({ mode: 'static', epoch: 'immutable-build', revision: 'immutable-build', embed: { allowedOrigins: [] } })
    expect(descriptor.capabilities.serverTests.available).toBe(false)
    expect(descriptor.assets.search).toMatch(/^assets\/histoire-local-search-/)
    const content = descriptor.assets.content[0]
    expect(JSON.parse(await readFile(join(fixture.root, content.docs), 'utf8')).body).toBe('lazy-doc-body')
    expect(JSON.parse(await readFile(join(fixture.root, content.rawSource), 'utf8')).body).toContain('source-body')
    expect(JSON.parse(await readFile(join(fixture.root, 'assets/histoire-local.json'), 'utf8'))).toEqual(descriptor)
    expect((await readdir(fixture.root, { recursive: true })).filter(path => /__embed\.html|histoire-embed/.test(path))).toEqual([])
    expect(JSON.stringify(descriptor)).not.toContain(fixture.root)
  })

  it('serves local data and coherent updates while disabled public routes still return 404', async () => {
    const runtime = { context: fixture.context, epoch: 'local-generation', ready: Promise.resolve(), isActive: () => true, onCollection: () => () => {} }
    const attachment = attachRuntimeCatalog(runtime as any, { projectId: 'local-project', epoch: runtime.epoch, root: fixture.root })
    await attachment.ready
    const send = vi.fn()
    const server = { config: { base: '/nested/book/' }, ws: { send } }
    const middleware = createEmbedMiddleware(server as any, fixture.context)
    const res = { setHeader: vi.fn(), end: vi.fn(), statusCode: 200 }
    const next = vi.fn()
    try {
      await middleware({ url: '/nested/book/__histoire/local/descriptor.json' } as any, res as any, next)
      expect(res.statusCode).toBe(200)
      const descriptor = JSON.parse(res.end.mock.calls.at(-1)[0])
      expect(descriptor.catalog.stories[0].id).toBe('story-a')
      await middleware({ url: `/nested/book/${descriptor.assets.content[0].docs}` } as any, res as any, next)
      expect(JSON.parse(res.end.mock.calls.at(-1)[0]).body).toBe('lazy-doc-body')
      fixture.story.story.title = 'Updated local story'
      await attachment.catalog.publish(fixture.context)
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'histoire:local:catalog', data: expect.objectContaining({ revision: expect.not.stringMatching(`^${descriptor.revision}$`) }) }))
      await middleware({ url: '/nested/book/histoire-embed.json' } as any, res as any, next)
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.end.mock.calls.at(-1)[0]).code).toBe('CAPABILITY_UNAVAILABLE')
      expect(next).not.toHaveBeenCalled()
    }
    finally { attachment.close() }
  })
})
