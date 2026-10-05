import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmbedSourceConnection } from '../../../../../histoire-app/src/embed/source.js'
import { prepareEmbedOutput, writeEmbedDescriptor } from '../../virtual/embed/output.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('first-party data-only source adapter', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('loads descriptor before lazy bodies and replaces baked origins without rebuilding', async () => {
    const prepared = await prepareEmbedOutput(fixture.context, createEmbedSource(fixture.context, fixture.catalog), fixture.root, 'assets/bridge.js')
    await writeEmbedDescriptor(fixture.context, prepared, fixture.root, 'immutable-build')
    const requested: string[] = []
    let override: unknown
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      requested.push(url.pathname)
      expect(url.origin).toBe('https://book.test')
      if (url.pathname.endsWith('histoire-embed-origins.json')) {
        expect(init?.cache).toBe('no-store')
        return override === undefined ? new Response('', { status: 404 }) : Response.json(override)
      }
      return new Response(await readFile(join(fixture.root, url.pathname.slice('/nested/book/'.length)), 'utf8'))
    }
    for (const value of [undefined, { version: 1, allowedOrigins: ['https://deployed.test'] }, { version: 1, allowedOrigins: ['*'] }]) {
      override = value
      requested.length = 0
      const connection = await createEmbedSourceConnection({ url: 'https://book.test/nested/book/', fetcher })
      expect(connection.allowedOrigins).toEqual(value === undefined ? ['https://host.test:8443'] : value.allowedOrigins[0] === '*' ? [] : ['https://deployed.test'])
      expect(requested).toEqual(['/nested/book/histoire-embed.json', '/nested/book/histoire-embed-origins.json'])
      const descriptor = connection.descriptor
      const capture = { sessionId: 's', connectionId: connection.id, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, signal: new AbortController().signal }
      expect(await connection.request('docs.get', { storyId: fixture.story.story.id }, capture)).toMatchObject({ body: 'lazy-doc-body', epoch: 'immutable-build' })
      expect(await connection.request('source.get', { storyId: fixture.story.story.id, mode: 'raw' }, capture)).toMatchObject({ body: expect.stringContaining('source-body'), revision: 'immutable-build' })
      expect(await connection.request('catalog.search', { query: 'lazy-doc-body' }, capture)).toEqual([expect.objectContaining({ kind: 'docs', target: { storyId: fixture.story.story.id, variantId: null } })])
      await expect(connection.request('docs.get', { storyId: '../../secret' }, capture)).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
      await connection.close()
      await expect(connection.request('docs.get', { storyId: fixture.story.story.id }, capture)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    }
  })

  it('publishes completed HMR revisions, rejects old ownership and ignores closed callbacks', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    let update: (value: any) => void
    let disposed = false
    const fetcher: typeof fetch = async () => Response.json(source.getDescriptor())
    const connection = await createEmbedSourceConnection({ url: 'https://book.test/nested/book/', fetcher, subscribe: (listener) => {
      update = listener
      return () => {
        disposed = true
      }
    } })
    const notifications: unknown[] = []
    connection.subscribe(event => notifications.push(event))
    const initial = connection.descriptor
    const capture = { sessionId: 's', connectionId: connection.id, sourceId: initial.sourceId, epoch: initial.epoch, revision: initial.revision, signal: new AbortController().signal }
    fixture.story.story.title = 'Updated'
    await fixture.catalog.publish(fixture.context)
    update(source.getDescriptor())
    expect(connection.descriptor.catalog.stories[0].title).toBe('Updated')
    expect(notifications).toHaveLength(1)
    await expect(connection.request('docs.get', { storyId: fixture.story.story.id }, capture)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await connection.close()
    update(null)
    expect(notifications).toHaveLength(1)
    expect(disposed).toBe(true)
  })

  it('reads supplied standalone projection without public bridge discovery or origin overrides', async () => {
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    descriptor.capabilities.openInEditor = { available: true }
    const requests: string[] = []
    const fetcher: typeof fetch = async (input) => {
      requests.push(new URL(String(input)).pathname)
      return String(input).endsWith('histoire-embed.json') ? Response.json(descriptor) : new Response(null, { status: 204 })
    }
    const connection = await createEmbedSourceConnection({ url: 'https://book.test/nested/book/', descriptor, actionBase: '__histoire/local/', fetcher })
    try {
      expect(requests).toEqual([])
      expect(connection.allowedOrigins).toEqual([])
      const capture = { sessionId: 'local', connectionId: connection.id, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, signal: new AbortController().signal }
      await connection.request('openInEditor', { storyId: fixture.story.story.id, variantId: null }, capture)
      expect(requests).toEqual(['/nested/book/__histoire/local/editor'])
    }
    finally {
      await connection.close()
    }
  })
})
