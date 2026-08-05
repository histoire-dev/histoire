import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createCollectionChannel } from '../story-collection/index.js'

/**
 * Builds the connect-style middleware registered by the collection channel
 * plugin, plus fakes for req/res.
 */
function setupChannel() {
  const channel = createCollectionChannel()
  let handler: ((req: any, res: any, next: any) => Promise<void>) | undefined
  channel.plugin.configureServer({
    middlewares: {
      use: (_path: string, h: any) => {
        handler = h
      },
    },
  })
  if (!handler) {
    throw new Error('middleware was not registered')
  }
  return { channel, handler }
}

function createRequest(body: string) {
  const req = Readable.from([body]) as any
  req.method = 'POST'
  return req
}

function createResponse() {
  return {
    statusCode: 0,
    end: vi.fn(),
  }
}

describe('browser collection channel middleware', () => {
  it('stores posted results and answers 204', async () => {
    const { channel, handler } = setupChannel()
    const res = createResponse()

    await handler(createRequest(JSON.stringify({
      token: 'run-1',
      file: '/specs/a.spec.ts',
      result: { stories: [] },
    })), res, vi.fn())

    expect(res.statusCode).toBe(204)
    expect(res.end).toHaveBeenCalled()
    expect(channel.read('run-1').results.get('/specs/a.spec.ts')).toEqual({ stories: [] })
  })

  it('answers 400 on a malformed body instead of rejecting unhandled', async () => {
    // Connect does not await async handlers: a rejection here would become an
    // unhandled rejection, and vitest's process-wide handler turns any stray
    // rejection into process.exit() — killing the dev server or build.
    const { handler } = setupChannel()
    const res = createResponse()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handler(createRequest('not json {'), res, vi.fn())).resolves.toBeUndefined()

    expect(res.statusCode).toBe(400)
    expect(res.end).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('isolates results per run token so a stale run cannot leak into a new one', async () => {
    const { channel, handler } = setupChannel()

    await handler(createRequest(JSON.stringify({
      token: 'run-1',
      file: '/specs/a.spec.ts',
      result: { stories: ['stale'] },
    })), createResponse(), vi.fn())
    await handler(createRequest(JSON.stringify({
      token: 'run-2',
      file: '/specs/a.spec.ts',
      result: { stories: ['fresh'] },
    })), createResponse(), vi.fn())

    // A late POST from the previous run reuses the same spec path; keying by
    // token is what keeps it from overwriting the current run's data.
    expect(channel.read('run-1').results.get('/specs/a.spec.ts')).toEqual({ stories: ['stale'] })
    expect(channel.read('run-2').results.get('/specs/a.spec.ts')).toEqual({ stories: ['fresh'] })
  })

  it('reads an unknown token as an empty run rather than undefined', () => {
    const { channel } = setupChannel()

    // Every spec can fail before posting anything; the consumer iterates these
    // maps unconditionally.
    expect(channel.read('never-ran').results.size).toBe(0)
    expect(channel.read('never-ran').failures.size).toBe(0)
  })

  it('records a spec failure and clears it when the file later succeeds', async () => {
    const { channel, handler } = setupChannel()

    await handler(createRequest(JSON.stringify({
      token: 'run-1',
      file: '/specs/a.spec.ts',
      failure: { error: 'story module threw' },
    })), createResponse(), vi.fn())
    expect(channel.read('run-1').failures.get('/specs/a.spec.ts')).toEqual({ error: 'story module threw' })

    // A retry of the same spec must not leave the run reporting both a result
    // and a failure for that file.
    await handler(createRequest(JSON.stringify({
      token: 'run-1',
      file: '/specs/a.spec.ts',
      result: { stories: [] },
    })), createResponse(), vi.fn())

    expect(channel.read('run-1').failures.has('/specs/a.spec.ts')).toBe(false)
    expect(channel.read('run-1').results.get('/specs/a.spec.ts')).toEqual({ stories: [] })
  })

  it('passes non-POST requests on to the next middleware', async () => {
    const { handler } = setupChannel()
    const res = createResponse()
    const next = vi.fn()
    const req = createRequest('')
    req.method = 'GET'

    await handler(req, res, next)

    // The endpoint lives on the run's own Vite server, which still has to serve
    // everything else on that path.
    expect(next).toHaveBeenCalled()
    expect(res.end).not.toHaveBeenCalled()
  })

  it('answers 400 when the request stream errors', async () => {
    const { handler } = setupChannel()
    const res = createResponse()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const req = new Readable({
      read() {
        this.destroy(new Error('socket aborted'))
      },
    }) as any
    req.method = 'POST'

    await expect(handler(req, res, vi.fn())).resolves.toBeUndefined()

    expect(res.statusCode).toBe(400)
    expect(res.end).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
