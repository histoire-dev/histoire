import {
  VITEST_MOCK_INTERCEPTOR_EVENTS,
  VITEST_MOCK_RPC_BARRIER_EVENT,
  VITEST_MOCK_RPC_ENDPOINT,
  VITEST_MOCK_RPC_METHODS,
} from '../vitest-mock-rpc.js'

/**
 * Standalone core of the Vitest mocking bridge used by the generated browser
 * runtimes: `createMockRpc` (mock resolution) and `createMockInterceptor`
 * (telling the dev server which modules are mocked). Deliberately free of
 * `import.meta` so it can be evaluated outside a module — that is what lets the
 * specs execute it against a fake `fetch` instead of asserting on its source.
 *
 * Nothing here ever *waits* on a Vite HMR payload: see
 * `src/node/vitest-mock-rpc.ts` for the deadlock that makes HMR replies
 * unusable, and why an HTTP round trip also removes the need for correlation
 * ids — a response can structurally only settle the request it answers, so
 * replies can never leak between frames or tabs sharing the dev server.
 */
export const MOCK_RPC_CORE = `
const mockRpcEndpoint = ${JSON.stringify(VITEST_MOCK_RPC_ENDPOINT)}
const mockRpcTimeout = 5_000

// Calls one dev-server RPC method and resolves with its result.
function createMockRpc(endpoint = mockRpcEndpoint) {
  // Per-method promise chain. Correctness does not depend on it (each request
  // owns its own response), but it keeps server-side ordering deterministic —
  // e.g. an invalidate cannot overtake the resolve it was meant to follow.
  const queues = new Map()

  async function sendRequest(method, data) {
    // Abort rather than just reject on timeout: a request nobody will answer
    // must not keep holding one of the browser's few connections to the origin.
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, mockRpcTimeout)

    const timeoutError = () => new Error(\`Histoire mock RPC timed out after \${mockRpcTimeout}ms: \${method}\`)

    let response
    let payload = null
    // The timer stays armed until the body is read: \`fetch\` resolves on the
    // response headers, so clearing it any earlier would leave a stalled body
    // hanging this request — and with it every later call of the same method,
    // which queues behind it.
    try {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, data }),
          signal: controller.signal,
        })
      }
      catch (error) {
        // Aborts we did not schedule mean the document is going away, which also
        // destroys whoever was waiting: rethrowing is all that is left to do.
        throw timedOut ? timeoutError() : error
      }

      try {
        payload = await response.json()
      }
      catch (error) {
        // A body we cannot read is only tolerable when the status already says
        // the request failed; otherwise silently returning \`undefined\` here would
        // register a mock under no resolved URL at all.
        if (timedOut) {
          throw timeoutError()
        }
        if (response.ok) {
          throw new Error(\`Histoire mock RPC returned a malformed response: \${method}\`)
        }
      }
    }
    finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new Error(\`Histoire mock RPC failed: \${(payload && payload.error) || response.status}\`)
    }

    return payload ? payload.result : undefined
  }

  return function mockRpc(method, data) {
    const send = () => sendRequest(method, data)
    const previous = queues.get(method) ?? Promise.resolve()
    const request = previous.then(send, send)
    queues.set(method, request.then(() => undefined, () => undefined))
    return request
  }
}

// Tells the dev server which modules this browsing context has mocked.
function createMockInterceptor(hot, mockRpc) {
  const instanceId = \`\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 10)}\`
  let nextBarrierId = 0

  // The mocker's own dev-server events are kept, because only its plugin owns
  // the registry they write to. What is dropped is how its stock interceptor
  // *waits* for them: on a \`<event>:result\` HMR payload, which queues behind
  // the very hot update whose module re-execution is waiting for it — the same
  // deadlock as the resolution RPC, and on top of that an uncorrelated
  // broadcast that any frame settles on. Sending stays on the HMR channel:
  // outbound messages are never queued.
  async function notify(event, data) {
    hot.send(event, data)

    // Vite dispatches one socket's messages in order and the mocker's handlers
    // are synchronous, so the mutation above has been applied by the time the
    // server sees this barrier. Waiting for it over HTTP is what keeps the wait
    // off the HMR channel the hot update is blocking.
    const barrierId = \`\${instanceId}-\${nextBarrierId++}\`
    hot.send(${JSON.stringify(VITEST_MOCK_RPC_BARRIER_EVENT)}, { barrierId })
    await mockRpc(${JSON.stringify(VITEST_MOCK_RPC_METHODS.awaitBarrier)}, { barrierId })
  }

  return {
    register: module => notify(${JSON.stringify(VITEST_MOCK_INTERCEPTOR_EVENTS.register)}, module.toJSON()),
    delete: id => notify(${JSON.stringify(VITEST_MOCK_INTERCEPTOR_EVENTS.delete)}, id),
    invalidate: () => notify(${JSON.stringify(VITEST_MOCK_INTERCEPTOR_EVENTS.invalidate)}, undefined),
  }
}
`

/**
 * Generated-code snippet embedded verbatim by the two browser runtimes (the
 * dev preview runtime and the vitest browser runtime): the standalone core
 * bound to a single instance per browsing context.
 */
export const MOCK_RPC_SNIPPET = `${MOCK_RPC_CORE}
// Vite rewrites requests under configured base before owned middleware runs.
const mockRpc = createMockRpc(new URL(${JSON.stringify(VITEST_MOCK_RPC_ENDPOINT.slice(1))}, new URL(import.meta.env.BASE_URL, window.location.href)).pathname)
`
