import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import { readRequestBody, RequestBodyTooLargeError } from './util/http-body.js'

/**
 * Dev-server path the browser runtimes POST their mock-resolution requests to.
 *
 * Why HTTP and not a Vite HMR event (which is what both `@vitest/mocker`'s own
 * `vitest:mocks:*` events and Histoire's first attempt used): Vite's HMR client
 * funnels **every** server → client payload through one strictly serial queue
 * (`createHMRHandler`), and handling an `update` payload is awaited until every
 * module that update re-executes has settled. A story calling `vi.mock` is
 * re-executed by exactly such an update and needs a resolution from the server,
 * so a reply travelling as an HMR payload queued behind the very update that
 * was waiting for it. Measured against a real dev server: the server answered
 * in 1 ms, the browser only processed the reply 5000 ms later — one millisecond
 * after the RPC timeout fired and unblocked the update. An HTTP round trip is
 * answered on its own connection and cannot be blocked by HMR processing.
 *
 * HTTP also makes correlation structural: a response can only ever settle the
 * request it answers, so replies cannot leak between the several mocker-enabled
 * browsing contexts sharing one dev server (preview iframe, controls sandbox
 * iframe, "open in new tab" sandbox, extra app tabs) — which is exactly what
 * `@vitest/mocker`'s uncorrelated `server.ws.send` broadcasts did.
 *
 * The path is absolute and base-less on purpose: the middleware is registered
 * from `configureServer`, which runs before Vite's base and transform
 * middlewares, so it matches whatever `base` the project configures.
 */
export const VITEST_MOCK_RPC_ENDPOINT = '/__histoire_vitest_mock_rpc'

/** RPC methods the browser runtimes may call, as sent in the request body. */
export const VITEST_MOCK_RPC_METHODS = {
  resolveId: 'resolveId',
  resolveMock: 'resolveMock',
  invalidate: 'invalidate',
  awaitBarrier: 'awaitBarrier',
} as const

/**
 * `@vitest/mocker`'s own dev-server events registering what is mocked. Only its
 * plugin owns the registry they write to, so Histoire keeps sending them —
 * outbound HMR messages are never queued — and only replaces how the browser
 * waits for them to be applied (see {@link VITEST_MOCK_RPC_BARRIER_EVENT}).
 */
export const VITEST_MOCK_INTERCEPTOR_EVENTS = {
  register: 'vitest:interceptor:register',
  delete: 'vitest:interceptor:delete',
  invalidate: 'vitest:interceptor:invalidate',
} as const

/**
 * Event a browser runtime sends right after an interceptor event, and then
 * waits for over {@link VITEST_MOCK_RPC_ENDPOINT}.
 *
 * Vite dispatches one socket's messages synchronously and in order, and the
 * mocker's interceptor handlers are synchronous, so this event arriving proves
 * that the interceptor event sent just before it has already been applied. That
 * is what lets the browser wait over HTTP instead of on the `<event>:result`
 * HMR payload `ModuleMockerServerInterceptor` waits for — which deadlocks, and
 * which the mocker broadcasts uncorrelated to every frame anyway.
 */
export const VITEST_MOCK_RPC_BARRIER_EVENT = 'histoire:mocks:barrier'

/** How long a barrier may stay unreached before the wait fails loudly. */
const BARRIER_TIMEOUT = 5_000

/**
 * Structural subset of `@vitest/mocker/node`'s `ServerMockResolver` that
 * Histoire uses.
 */
interface ServerMockResolverLike {
  resolveId: (id: string, importer?: string) => unknown
  resolveMock: (id: string, importer: string, options: { mock: 'spy' | 'factory' | 'auto' }) => unknown
  invalidate: (ids: string[]) => void
}

/**
 * The only `@vitest/mocker` internal Histoire depends on here:
 * `ServerMockResolver` is a **named export of `@vitest/mocker/node`** (typed in
 * its `node.d.ts`), verified through 4.1.10 — a version supported by the
 * `vitest@^4` peer range declared in this package. `mockerPlugin` builds the
 * exact same object (`new ServerMockResolver(server)`); Histoire only replaces
 * the transport around it.
 */
export interface VitestMockerNodeModule {
  ServerMockResolver?: new (server: ViteDevServer, options?: { moduleDirectories?: string[] }) => ServerMockResolverLike
}

/** Handlers of the RPC methods, keyed by {@link VITEST_MOCK_RPC_METHODS}. */
type MockRpcHandlers = Record<string, (data: any) => unknown>

/**
 * Pairs the barrier events arriving over the websocket with the HTTP requests
 * waiting for them. Either can come first: the two travel on independent
 * connections.
 * @param timeout How long an unreached barrier is waited for.
 */
export function createMockBarriers(timeout = BARRIER_TIMEOUT) {
  /** Barriers reached before anything waited for them, with their expiry. */
  const reached = new Map<string, NodeJS.Timeout>()
  const waiting = new Map<string, () => void>()

  /** Drops a barrier nobody claimed, so a dead frame cannot leak entries. */
  function expire(barrierId: string) {
    const expiry = setTimeout(() => reached.delete(barrierId), timeout)
    expiry.unref?.()
    return expiry
  }

  return {
    /** Records that the browser's preceding interceptor event was applied. */
    reach(barrierId: string) {
      const resolve = waiting.get(barrierId)
      if (resolve) {
        waiting.delete(barrierId)
        resolve()
        return
      }
      reached.set(barrierId, expire(barrierId))
    },
    /** Resolves once `barrierId` is reached; rejects rather than hanging. */
    wait(barrierId: string) {
      const alreadyReached = reached.get(barrierId)
      if (alreadyReached) {
        clearTimeout(alreadyReached)
        reached.delete(barrierId)
        return Promise.resolve()
      }

      return new Promise<void>((resolve, reject) => {
        waiting.set(barrierId, resolve)
        const expiry = setTimeout(() => {
          if (waiting.delete(barrierId)) {
            reject(new Error(`Histoire mock interceptor barrier ${barrierId} was never reached`))
          }
        }, timeout)
        expiry.unref?.()
      })
    },
  }
}

/** Writes one JSON response, ignoring a socket the browser already dropped. */
function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  try {
    res.statusCode = statusCode
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(payload))
  }
  catch {
    // The frame navigated away or closed while resolving — nothing to answer.
  }
}

/**
 * Builds the middleware answering mock-resolution requests.
 * @param handlers The RPC method implementations.
 */
function createMockRpcMiddleware(handlers: MockRpcHandlers) {
  return async function histoireVitestMockRpcMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) {
    // Only our own JSON POSTs are served. Everything else — including the
    // preflight a cross-origin page would need to send this content type —
    // falls through to Vite, which answers it without any CORS header, so the
    // browser blocks the request. Vite's own cors/host middlewares already ran.
    if (req.method !== 'POST' || !String(req.headers['content-type'] ?? '').includes('application/json')) {
      next()
      return
    }

    try {
      const { method, data } = JSON.parse(await readRequestBody(req)) ?? {}
      const handler = handlers[method]
      if (!handler) {
        sendJson(res, 400, { error: `Unknown Histoire mock RPC method: ${method}` })
        return
      }

      sendJson(res, 200, { result: await handler(data ?? {}) })
    }
    catch (error) {
      // Connect does not await async handlers: a rejection escaping here
      // becomes an unhandled rejection (which Vitest's process-wide handler
      // turns into a process exit) and leaves the browser waiting for its
      // timeout instead of failing right away.
      sendJson(res, error instanceof RequestBodyTooLargeError ? 413 : 500, {
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      })
    }
  }
}

/**
 * Builds the Vite plugin answering Histoire's mock-resolution endpoint by
 * delegating to `@vitest/mocker`'s own server resolver.
 * @param mockerNode The imported `@vitest/mocker/node` module.
 * @throws If the module no longer exposes `ServerMockResolver`, so a Vitest
 * upgrade breaks loudly at dev-server start instead of silently serving
 * unmocked modules.
 */
export function createVitestMockRpcPlugin(mockerNode: VitestMockerNodeModule): VitePlugin {
  const ServerMockResolver = mockerNode?.ServerMockResolver
  if (typeof ServerMockResolver !== 'function') {
    throw new TypeError(
      '@vitest/mocker/node no longer exports ServerMockResolver. Histoire needs it to answer mock '
      + 'resolution requests. Expected vitest ^4 (verified through 4.1.10).',
    )
  }

  return {
    name: 'histoire:vitest-mock-rpc',

    configureServer(server) {
      const resolver = new ServerMockResolver(server)
      const barriers = createMockBarriers()

      // The only listener Histoire puts on the HMR channel, and a one-way one:
      // it never answers, so it cannot be blocked by an update in flight.
      server.ws.on(VITEST_MOCK_RPC_BARRIER_EVENT, ({ barrierId }: { barrierId: string }) => {
        barriers.reach(barrierId)
      })

      server.middlewares.use(VITEST_MOCK_RPC_ENDPOINT, createMockRpcMiddleware({
        [VITEST_MOCK_RPC_METHODS.resolveId]: ({ id, importer }) => resolver.resolveId(id, importer),
        [VITEST_MOCK_RPC_METHODS.resolveMock]: ({ id, importer, options }) => resolver.resolveMock(id, importer, options),
        [VITEST_MOCK_RPC_METHODS.invalidate]: ({ ids }) => resolver.invalidate(ids),
        [VITEST_MOCK_RPC_METHODS.awaitBarrier]: ({ barrierId }) => barriers.wait(barrierId),
      }))
    },
  }
}
