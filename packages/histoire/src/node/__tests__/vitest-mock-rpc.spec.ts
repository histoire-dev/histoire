import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { importResolvedModule } from '../util/import-resolved.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'
import {
  createMockBarriers,
  createVitestMockRpcPlugin,
  VITEST_MOCK_RPC_BARRIER_EVENT,
  VITEST_MOCK_RPC_ENDPOINT,
  VITEST_MOCK_RPC_METHODS,
} from '../vitest-mock-rpc.js'

/** Records the middlewares and ws listeners a plugin registers. */
function createFakeServer() {
  const middlewares: Array<{ path: string, handler: any }> = []
  const wsListeners = new Map<string, (payload: any) => void>()
  return {
    config: { root: '/root' },
    middlewares: {
      use(path: string, handler: any) {
        middlewares.push({ path, handler })
      },
    },
    ws: {
      on(event: string, handler: (payload: any) => void) {
        wsListeners.set(event, handler)
      },
    },
    registered: middlewares,
    wsListeners,
  }
}

/** Builds an incoming JSON POST for the RPC endpoint. */
function createRequest(body: unknown, overrides: { method?: string, contentType?: string } = {}) {
  const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]) as any
  req.method = overrides.method ?? 'POST'
  req.headers = { 'content-type': overrides.contentType ?? 'application/json' }
  return req
}

/** Captures the status and JSON body written by the middleware. */
function createResponse() {
  const chunks: string[] = []
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value
    },
    end(chunk?: string) {
      if (chunk) {
        chunks.push(chunk)
      }
    },
    get json() {
      return JSON.parse(chunks.join(''))
    },
  }
}

/** Minimal stand-in for `@vitest/mocker`'s `ServerMockResolver`. */
function createResolverStub(overrides: Record<string, any> = {}) {
  const resolver = {
    resolveId: vi.fn(async (id: string) => ({ id: `/resolved${id}`, url: `/resolved${id}`, optimized: false })),
    resolveMock: vi.fn(async (id: string) => ({ mockType: 'automock', resolvedId: id, resolvedUrl: id })),
    invalidate: vi.fn(),
    ...overrides,
  }
  return {
    resolver,
    // A constructor returning an object hands that object back from `new`.
    mockerNode: { ServerMockResolver: function () { return resolver } as any },
  }
}

function setup(overrides?: Record<string, any>) {
  const { resolver, mockerNode } = createResolverStub(overrides)
  const plugin = createVitestMockRpcPlugin(mockerNode)
  const server = createFakeServer()
  ;(plugin.configureServer as any)(server)
  const middleware = server.registered[0]

  return {
    resolver,
    server,
    middleware,
    /** Runs the middleware and yields the response plus whether it fell through. */
    async call(body: unknown, overrides?: { method?: string, contentType?: string }) {
      const res = createResponse()
      const next = vi.fn()
      await middleware.handler(createRequest(body, overrides), res, next)
      return { res, fellThrough: next.mock.calls.length > 0 }
    },
  }
}

describe('vitest mock RPC plugin', () => {
  it('answers the requesting round trip on its own dev-server endpoint', async () => {
    // The RPC deliberately does not ride Vite's HMR channel: replies there are
    // handled through one serial queue that a hot update in flight blocks, and
    // @vitest/mocker's own `server.ws.send` answers are broadcast to every
    // frame with no correlation at all.
    const { server, call } = setup()

    expect(server.registered).toHaveLength(1)
    expect(server.registered[0].path).toBe(VITEST_MOCK_RPC_ENDPOINT)
    // The only thing left on the HMR channel is the one-way barrier listener:
    // nothing the browser ever waits for a reply to.
    expect([...server.wsListeners.keys()]).toEqual([VITEST_MOCK_RPC_BARRIER_EVENT])

    const { res } = await call({
      method: VITEST_MOCK_RPC_METHODS.resolveId,
      data: { id: '/dep.js', importer: '/story.vue' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({
      result: { id: '/resolved/dep.js', url: '/resolved/dep.js', optimized: false },
    })
  })

  it('forwards mock resolution arguments to the resolver', async () => {
    const { resolver, call } = setup()

    await call({
      method: VITEST_MOCK_RPC_METHODS.resolveMock,
      data: { id: './dep', importer: '/story.vue', options: { mock: 'factory' } },
    })
    const { res } = await call({
      method: VITEST_MOCK_RPC_METHODS.invalidate,
      data: { ids: ['/a.js', '/b.js'] },
    })

    expect(resolver.resolveMock).toHaveBeenCalledWith('./dep', '/story.vue', { mock: 'factory' })
    expect(resolver.invalidate).toHaveBeenCalledWith(['/a.js', '/b.js'])
    expect(res.statusCode).toBe(200)
    expect(res.json).toEqual({})
  })

  it('reports resolver failures back to the caller instead of rejecting', async () => {
    // Connect does not await these handlers: an escaping rejection becomes an
    // unhandled rejection, and the browser side would hang until its timeout.
    const { call } = setup({
      resolveId: vi.fn(async () => {
        throw new Error('boom')
      }),
    })

    const { res } = await call({ method: VITEST_MOCK_RPC_METHODS.resolveId, data: { id: './x' } })

    expect(res.statusCode).toBe(500)
    expect(res.json.error).toContain('boom')
  })

  it('rejects an unknown method instead of answering it with nothing', async () => {
    const { call } = setup()

    const { res } = await call({ method: 'evaluateAnything', data: {} })

    expect(res.statusCode).toBe(400)
    expect(res.json.error).toContain('evaluateAnything')
  })

  it('serves only its own JSON POSTs, letting anything else fall through', async () => {
    // Falling through means Vite answers (404) without a CORS header, so a
    // cross-origin page cannot use this endpoint to resolve project modules.
    const { call } = setup()

    expect((await call('', { method: 'OPTIONS' })).fellThrough).toBe(true)
    expect((await call('', { method: 'GET' })).fellThrough).toBe(true)
    expect((await call('', { contentType: 'text/plain' })).fellThrough).toBe(true)
  })

  it('releases an interceptor barrier once its websocket event arrives', async () => {
    // The browser sends the mocker's interceptor event, then this barrier, then
    // waits for it over HTTP. Vite dispatches one socket's messages in order
    // and the mocker's handlers are synchronous, so a reached barrier proves
    // the registration before it was applied.
    const { server, call } = setup()
    const reach = server.wsListeners.get(VITEST_MOCK_RPC_BARRIER_EVENT)!

    const pending = call({
      method: VITEST_MOCK_RPC_METHODS.awaitBarrier,
      data: { barrierId: 'preview-1' },
    })
    await Promise.resolve()

    // Another frame's barrier must not release this one.
    reach({ barrierId: 'sandbox-1' })
    reach({ barrierId: 'preview-1' })

    expect((await pending).res.statusCode).toBe(200)
  })

  it('releases a barrier reached before anything waited for it', async () => {
    // The websocket event and the HTTP request travel on independent
    // connections, so the barrier routinely arrives first.
    const { server, call } = setup()

    server.wsListeners.get(VITEST_MOCK_RPC_BARRIER_EVENT)!({ barrierId: 'preview-1' })
    const { res } = await call({
      method: VITEST_MOCK_RPC_METHODS.awaitBarrier,
      data: { barrierId: 'preview-1' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('fails a barrier that is never reached instead of hanging', async () => {
    vi.useFakeTimers()
    try {
      const barriers = createMockBarriers(1000)
      const wait = barriers.wait('lost')
      const assertion = expect(wait).rejects.toThrow(/never reached/)

      await vi.advanceTimersByTimeAsync(2000)
      await assertion
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('fails loudly when @vitest/mocker no longer exposes ServerMockResolver', () => {
    expect(() => createVitestMockRpcPlugin({} as any)).toThrow(/ServerMockResolver/)
  })

  it('the installed @vitest/mocker still exports ServerMockResolver', async () => {
    // Version canary for the one @vitest/mocker internal Histoire depends on
    // (named export of `@vitest/mocker/node`, verified through 4.1.10, which
    // is what the declared `vitest@^4` peer range ships).
    const mockerModuleId = tryResolveVitestModule(process.cwd(), '@vitest/mocker/node')
    expect(mockerModuleId).toBeTruthy()

    const mockerNode = await importResolvedModule(mockerModuleId!)

    expect(typeof mockerNode.ServerMockResolver).toBe('function')
    expect(typeof mockerNode.ServerMockResolver.prototype.resolveId).toBe('function')
    expect(typeof mockerNode.ServerMockResolver.prototype.resolveMock).toBe('function')
    expect(typeof mockerNode.ServerMockResolver.prototype.invalidate).toBe('function')
  })
})
