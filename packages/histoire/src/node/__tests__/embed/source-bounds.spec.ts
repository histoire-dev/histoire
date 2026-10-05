import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmbedSourceConnection } from '../../../../../histoire-app/src/embed/source.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('source request limits and cancellation', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('rejects oversized lazy content before successful DTO publication', async () => {
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    const connection = await createEmbedSourceConnection({ url: 'https://book.test/', fetcher: async input => String(input).endsWith('histoire-embed.json') ? Response.json(descriptor) : Response.json({ body: 'x'.repeat(1024 * 1024) }) })
    const capture = { sessionId: 's', connectionId: connection.id, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, signal: new AbortController().signal }
    try {
      await expect(connection.request('docs.get', { storyId: fixture.story.story.id }, capture)).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' })
    }
    finally { await connection.close() }
  })

  it('cancels one search promptly while another consumer retains shared source-owned acquisition', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const descriptor = source.getDescriptor()
    const pending = deferred<Response>()
    let fetchSignal: AbortSignal
    const connection = await createEmbedSourceConnection({ url: 'https://book.test/', fetcher: async (input, init) => {
      if (String(input).endsWith('histoire-embed.json')) return Response.json(descriptor)
      fetchSignal = init.signal as AbortSignal
      return pending.promise
    } })
    const abort = new AbortController()
    const capture = { sessionId: 's', connectionId: connection.id, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, signal: abort.signal }
    try {
      const first = connection.request('catalog.search', { query: 'lazy-doc-body' }, capture)
      const second = connection.request('catalog.search', { query: 'lazy-doc-body' }, { ...capture, signal: new AbortController().signal })
      abort.abort()
      await expect(first).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(fetchSignal.aborted).toBe(false)
      pending.resolve(Response.json(source.getSearch()))
      await expect(second).resolves.toHaveLength(1)
    }
    finally {
      pending.resolve(Response.json(source.getSearch()))
      await connection.close()
    }
  })
})
