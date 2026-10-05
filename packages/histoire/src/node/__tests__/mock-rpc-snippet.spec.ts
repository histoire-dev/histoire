import fs from 'node:fs'
import { resolve } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOCK_RPC_CORE, MOCK_RPC_SNIPPET } from '../virtual/mock-rpc-snippet.js'
import {
  VITEST_MOCK_INTERCEPTOR_EVENTS,
  VITEST_MOCK_RPC_BARRIER_EVENT,
  VITEST_MOCK_RPC_ENDPOINT,
  VITEST_MOCK_RPC_METHODS,
} from '../vitest-mock-rpc.js'
import { flushMicrotasks } from './utils/flush.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

interface MockRpcRequest {
  method: string
  data: any
  /** Answers this request; nothing else can observe the value. */
  respond: (status: number, payload: unknown) => void
  /** Answers with a status but a body that cannot be parsed as JSON. */
  respondUnreadable: (status: number) => void
}

interface SnippetCore {
  createMockRpc: () => (method: string, data?: any) => Promise<any>
  createMockInterceptor: (hot: any, mockRpc: any) => {
    register: (module: any) => Promise<void>
    delete: (id: string) => Promise<void>
    invalidate: () => Promise<void>
  }
}

/** Evaluates the standalone snippet core and returns its factories. */
function evaluateCore(): SnippetCore {
  // eslint-disable-next-line no-new-func -- the snippet ships as executable JS; running it is the point of these tests
  return new Function(`${MOCK_RPC_CORE}\nreturn { createMockRpc, createMockInterceptor }`)()
}

/** Shorthand for the RPC alone, which most specs are about. */
function evaluateRpc() {
  return evaluateCore().createMockRpc()
}

/**
 * Fake `import.meta.hot` recording outbound messages. It deliberately has no
 * usable inbound side: anything waiting on one would deadlock behind a hot
 * update in flight, which is exactly what these runtimes must never do.
 */
function createHot() {
  const sent: Array<{ event: string, data: any }> = []
  return {
    sent,
    send(event: string, data: any) {
      sent.push({ event, data })
    },
    on: vi.fn(),
  }
}

/**
 * Fake dev server shared by every frame. Requests are captured instead of being
 * answered, so each spec decides when and how each one is responded to.
 */
function createServer() {
  const requests: MockRpcRequest[] = []

  const fetchStub = vi.fn(async (url: string, init: any) => {
    expect(url).toBe(VITEST_MOCK_RPC_ENDPOINT)
    const body = JSON.parse(init.body)

    return new Promise((resolveResponse, rejectResponse) => {
      init.signal?.addEventListener('abort', () => {
        rejectResponse(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })

      const respondWith = (status: number, json: () => Promise<unknown>) => {
        resolveResponse({ ok: status >= 200 && status < 300, status, json })
      }

      requests.push({
        method: body.method,
        data: body.data,
        respond: (status, payload) => respondWith(status, async () => payload),
        respondUnreadable: status => respondWith(status, () => Promise.reject(new Error('not json'))),
      })
    })
  })

  vi.stubGlobal('fetch', fetchStub)

  return {
    requests,
    fetchStub,
    /** Answers `request` with the resolver result. */
    reply(request: MockRpcRequest, result: unknown) {
      request.respond(200, { result })
    },
    /** Answers `request` with a server-side failure. */
    fail(request: MockRpcRequest, error: string) {
      request.respond(500, { error })
    },
  }
}

/**
 * Models Vite's HMR client message handling: every server → client payload is
 * run through ONE strictly serial queue (`createHMRHandler`), and an `update`
 * payload is awaited until every module it re-executes has settled.
 */
function createSerialHmrChannel() {
  let tail = Promise.resolve()

  return {
    /** Queues one payload handler behind the ones already being handled. */
    handle(run: () => unknown) {
      const done = tail.then(run, run)
      tail = done.then(() => undefined, () => undefined)
      return done
    },
  }
}

describe('mock RPC snippet', () => {
  it('binds generated browser RPC to nested Vite base instead of origin root', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ result: 'resolved' }) }))
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { href: 'https://book.example/book/__sandbox.html' } })
    const source = MOCK_RPC_SNIPPET.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/book/'))
    // eslint-disable-next-line no-new-func -- execute actual generated snippet with resolved Vite constant
    const rpc = new Function(`${source}\nreturn mockRpc`)()
    expect(await rpc('resolveId', { id: './dep' })).toBe('resolved')
    expect(fetch.mock.calls[0][0]).toBe('/book/__histoire_vitest_mock_rpc')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('settles without the Vite HMR message channel being drained', async () => {
    // Regression: the RPC used to travel on Vite `custom` HMR events. Vite
    // handles every server → client payload through one serial queue and awaits
    // the full application of an `update` payload, which re-executes the story
    // module — whose `vi.mock` needs this very RPC. The reply, being an HMR
    // payload itself, queued behind the update that was waiting for it.
    // Measured against a real dev server: answered in 1 ms, processed 5000 ms
    // later, one millisecond after the RPC timeout unblocked the update.
    const server = createServer()
    const rpc = evaluateRpc()
    const hmr = createSerialHmrChannel()
    let hmrPayloadHandled = false

    // The story module re-executed by the hot update resolves its mock here;
    // nothing else may be handled on the HMR channel until that update returns,
    // so the RPC has to settle while the channel is still blocked.
    const update = hmr.handle(async () => {
      const result = await rpc(VITEST_MOCK_RPC_METHODS.resolveMock, { id: './dep', importer: '/story.vue' })
      return { result, hmrPayloadHandled }
    })
    // What the old transport needed to run to answer: a payload stuck behind
    // the update above.
    void hmr.handle(() => {
      hmrPayloadHandled = true
    })

    await flushMicrotasks()
    server.reply(server.requests[0], { resolvedUrl: '/dep.js' })

    await expect(update).resolves.toEqual({
      result: { resolvedUrl: '/dep.js' },
      hmrPayloadHandled: false,
    })
  })

  it('keeps concurrent requests from two frames apart', async () => {
    // Several mocker-enabled browsing contexts share one dev server (preview
    // iframe, controls sandbox, a second app tab…). A reply must never settle
    // another context's request — `@vitest/mocker`'s own broadcast events did,
    // silently registering a mock under another module's resolved URL.
    const server = createServer()
    const preview = evaluateRpc()
    const sandbox = evaluateRpc()

    const previewPromise = preview(VITEST_MOCK_RPC_METHODS.resolveId, { id: './preview', importer: '/a' })
    const sandboxPromise = sandbox(VITEST_MOCK_RPC_METHODS.resolveId, { id: './sandbox', importer: '/b' })
    await flushMicrotasks()

    expect(server.requests).toHaveLength(2)
    // Answer out of order: the frames must not swap resolutions.
    server.reply(server.requests[1], { id: '/sandbox.js' })
    server.reply(server.requests[0], { id: '/preview.js' })

    await expect(previewPromise).resolves.toEqual({ id: '/preview.js' })
    await expect(sandboxPromise).resolves.toEqual({ id: '/sandbox.js' })
  })

  it('posts the method with its payload and resolves with the result', async () => {
    const server = createServer()
    const rpc = evaluateRpc()

    const promise = rpc(VITEST_MOCK_RPC_METHODS.resolveMock, {
      id: './dep',
      importer: '/story.vue',
      options: { mock: 'factory' },
    })
    await flushMicrotasks()

    expect(server.fetchStub.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(server.requests[0]).toMatchObject({
      method: VITEST_MOCK_RPC_METHODS.resolveMock,
      data: { id: './dep', importer: '/story.vue', options: { mock: 'factory' } },
    })

    server.reply(server.requests[0], { mockType: 'manual', resolvedUrl: '/dep.js' })

    await expect(promise).resolves.toEqual({ mockType: 'manual', resolvedUrl: '/dep.js' })
  })

  it('rejects with the server error instead of resolving with a bogus value', async () => {
    const server = createServer()
    const rpc = evaluateRpc()

    const promise = rpc(VITEST_MOCK_RPC_METHODS.resolveId, { id: './broken' })
    await flushMicrotasks()
    server.fail(server.requests[0], 'Cannot resolve ./broken')

    await expect(promise).rejects.toThrow('Cannot resolve ./broken')
  })

  it('rejects rather than returning undefined when a success body is unreadable', async () => {
    // Resolving with `undefined` would register the mock under no URL at all.
    const server = createServer()
    const rpc = evaluateRpc()

    const promise = rpc(VITEST_MOCK_RPC_METHODS.resolveId, { id: './a' })
    await flushMicrotasks()
    server.requests[0].respondUnreadable(200)

    await expect(promise).rejects.toThrow(/malformed/)
  })

  it('aborts and rejects when no answer arrives instead of hanging forever', async () => {
    vi.useFakeTimers()
    try {
      const server = createServer()
      const rpc = evaluateRpc()

      const promise = rpc(VITEST_MOCK_RPC_METHODS.resolveId, { id: './lost' })
      // Attach the rejection handler before advancing so the rejection is never
      // unhandled.
      const assertion = expect(promise).rejects.toThrow(/timed out/i)
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion

      // A request nobody will answer must also stop holding a connection.
      expect(server.fetchStub.mock.calls[0][1].signal.aborted).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('serializes requests per method while letting different methods overlap', async () => {
    const server = createServer()
    const rpc = evaluateRpc()

    const first = rpc(VITEST_MOCK_RPC_METHODS.resolveId, { id: './first' })
    const second = rpc(VITEST_MOCK_RPC_METHODS.resolveId, { id: './second' })
    const invalidated = rpc(VITEST_MOCK_RPC_METHODS.invalidate, { ids: ['/a.js'] })
    await flushMicrotasks()

    expect(server.requests.map(request => request.method)).toEqual([
      VITEST_MOCK_RPC_METHODS.resolveId,
      VITEST_MOCK_RPC_METHODS.invalidate,
    ])

    server.reply(server.requests[0], { id: '/first.js' })
    server.requests[1].respond(200, {})
    await flushMicrotasks()

    expect(server.requests).toHaveLength(3)
    expect(server.requests[2].data.id).toBe('./second')
    server.reply(server.requests[2], { id: '/second.js' })

    await expect(first).resolves.toEqual({ id: '/first.js' })
    await expect(second).resolves.toEqual({ id: '/second.js' })
    await expect(invalidated).resolves.toBeUndefined()
  })

  it('acknowledges an interceptor registration over HTTP, not over the HMR channel', async () => {
    // Same deadlock, second offender: `@vitest/mocker`'s own
    // ModuleMockerServerInterceptor waits for a `<event>:result` HMR payload,
    // so registering a mock during a hot update also burned the full 5 s.
    // Sending stays on the HMR channel (outbound is never queued); only the
    // wait moves to HTTP, and the barrier is what makes that wait meaningful.
    const server = createServer()
    const core = evaluateCore()
    const hot = createHot()
    const interceptor = core.createMockInterceptor(hot, core.createMockRpc())

    const registered = interceptor.register({ toJSON: () => ({ type: 'automock', url: '/dep.js' }) })
    await flushMicrotasks()

    expect(hot.on).not.toHaveBeenCalled()
    // Order is the whole correctness argument: Vite dispatches one socket's
    // messages in order, so the barrier proves the registration was applied.
    expect(hot.sent).toEqual([
      { event: VITEST_MOCK_INTERCEPTOR_EVENTS.register, data: { type: 'automock', url: '/dep.js' } },
      { event: VITEST_MOCK_RPC_BARRIER_EVENT, data: { barrierId: expect.any(String) } },
    ])
    expect(server.requests[0]).toMatchObject({
      method: VITEST_MOCK_RPC_METHODS.awaitBarrier,
      data: { barrierId: hot.sent[1].data.barrierId },
    })

    let settled = false
    void registered.then(() => {
      settled = true
    })
    await flushMicrotasks()
    // Nothing may proceed before the server confirmed the registration.
    expect(settled).toBe(false)

    server.reply(server.requests[0], undefined)
    await expect(registered).resolves.toBeUndefined()
  })

  it('routes every interceptor mutation through its own barrier', async () => {
    const server = createServer()
    const core = evaluateCore()
    const hot = createHot()
    const interceptor = core.createMockInterceptor(hot, core.createMockRpc())

    void interceptor.delete('/dep.js')
    await flushMicrotasks()
    server.reply(server.requests[0], undefined)
    await flushMicrotasks()
    void interceptor.invalidate()
    await flushMicrotasks()

    expect(hot.sent.map(message => message.event)).toEqual([
      VITEST_MOCK_INTERCEPTOR_EVENTS.delete,
      VITEST_MOCK_RPC_BARRIER_EVENT,
      VITEST_MOCK_INTERCEPTOR_EVENTS.invalidate,
      VITEST_MOCK_RPC_BARRIER_EVENT,
    ])
    expect(hot.sent[0].data).toBe('/dep.js')
    // Barrier ids must be distinct, otherwise one mutation's acknowledgement
    // would release another's.
    expect(hot.sent[1].data.barrierId).not.toBe(hot.sent[3].data.barrierId)
  })

  it('never waits on a Vite HMR payload', () => {
    // The deadlock comes back the moment any part of this bridge waits for an
    // HMR payload, and `hot.on` is the shape of such a wait. Sending is fine:
    // outbound HMR messages are never queued.
    expect(MOCK_RPC_CORE).not.toContain('hot.on')
    // The core must also stay `import.meta`-free so it can be evaluated outside
    // a module (that is what makes these tests work).
    expect(MOCK_RPC_CORE).not.toContain('import.meta')
    expect(MOCK_RPC_SNIPPET).toContain(MOCK_RPC_CORE)
    expect(MOCK_RPC_SNIPPET).toContain('createMockRpc(')
  })

  it('is embedded by both generated runtimes, which use the correlated endpoint', () => {
    const previewRuntime = generatePreviewRuntimeSource()
    const browserRuntimeSource = fs.readFileSync(resolve(process.cwd(), 'src/node/virtual/vitest-browser-runtime.ts'), 'utf8')

    // The preview runtime is asserted on its generated output: it must embed
    // this exact snippet, exactly once — a second copy is the drift this
    // shared snippet exists to prevent.
    expect(previewRuntime).toContain(MOCK_RPC_SNIPPET)
    expect(previewRuntime.split('function mockRpc(method, data) {')).toHaveLength(2)
    // eslint-disable-next-line no-template-curly-in-string -- asserting on literal generator source
    expect(browserRuntimeSource).toContain('${MOCK_RPC_SNIPPET}')
    // The drift-prone duplicated implementation must be gone.
    expect(browserRuntimeSource).not.toContain('function mockRpc(method, data) {')
    // Going back to @vitest/mocker's uncorrelated broadcast events would
    // silently reintroduce cross-frame reply mixing.
    expect(previewRuntime).not.toContain('vitest:mocks:')
    expect(browserRuntimeSource).not.toContain('vitest:mocks:')
    // Same for its interceptor, which additionally deadlocks against hot
    // updates because it waits for its acknowledgement on the HMR channel.
    expect(previewRuntime).not.toContain('new ModuleMockerServerInterceptor')
    expect(browserRuntimeSource).not.toContain('new ModuleMockerServerInterceptor')
  })
})
