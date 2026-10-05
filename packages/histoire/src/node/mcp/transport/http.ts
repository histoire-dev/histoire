import type { McpServerFactory } from '@modelcontextprotocol/server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { McpHttpPolicy } from './http-guards.js'
import type { DevMcpOptions } from './http-options.js'
import { createServer } from 'node:http'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createMcpTokenVerifier, validateMcpToken } from './http-auth.js'
import { MCP_HTTP_BODY_BYTES, MCP_HTTP_CONCURRENT_CALLS } from './http-body.js'
import { guardMcpHttp, rejectMcpHttp, validateMcpHttpPolicy } from './http-guards.js'

/** Creates a guarded mounted handler usable on dev or production Node listeners. */
export function createMcpHttpHandler(factory: McpServerFactory, policy: McpHttpPolicy, observeExchange?: (work: () => Promise<void>) => Promise<void>) {
  validateMcpHttpPolicy(policy)
  validateMcpToken(policy.token, policy.mode === 'protected-node')
  const verify = createMcpTokenVerifier(policy.token)
  const handler = createMcpHandler(factory, { legacy: 'stateless', responseMode: 'json', maxRequestBodySize: MCP_HTTP_BODY_BYTES })
  const dispatch = toNodeHandler(handler, { maxRequestBodySize: MCP_HTTP_BODY_BYTES })
  let active = 0
  let closed = false
  let closing: Promise<void> | undefined
  return {
    /** Rejects before protocol parsing; SDK owns every JSON-RPC method and revision. */
    async handle(request: IncomingMessage, response: ServerResponse) {
      if (closed) {
        rejectMcpHttp(response, 503, 'MCP endpoint is closing')
        return
      }
      if (!guardMcpHttp(request, response, policy)) return
      if (!verify(request.headers.authorization)) {
        rejectMcpHttp(response, 401, 'MCP bearer token required')
        return
      }
      if (active >= MCP_HTTP_CONCURRENT_CALLS) {
        rejectMcpHttp(response, 429, 'MCP request limit reached')
        return
      }
      active++
      try {
        const authenticated = request as IncomingMessage & { auth?: { token: string, clientId: string, scopes: string[] } }
        if (policy.token !== undefined) authenticated.auth = { token: policy.token, clientId: policy.principal, scopes: [] }
        if (observeExchange) await observeExchange(() => dispatch(authenticated, response))
        else await dispatch(authenticated, response)
      }
      finally { active-- }
    },
    /** Stops admission immediately and closes active modern protocol exchanges once. */
    close() {
      closed = true
      return closing ??= handler.close()
    },
  }
}

/** Opens one owned loopback listener; only the implicit default port can fall back. */
export async function startDevMcpHttp(options: DevMcpOptions & { factory: McpServerFactory, principal: string, token?: string, observeExchange?: (work: () => Promise<void>) => Promise<void> }) {
  let transport: ReturnType<typeof createMcpHttpHandler> | undefined
  let closing: Promise<void> | undefined
  const server = createServer((request, response) => {
    if (!transport) {
      rejectMcpHttp(response, 503, 'MCP endpoint is starting')
      return
    }
    void transport.handle(request, response).catch(() => {
      if (!response.headersSent) rejectMcpHttp(response, 500, 'MCP request failed')
      else response.destroy()
    })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  /** Observes one bind attempt without retaining error/listening event handlers. */
  function listen(port: number) {
    return new Promise<void>((resolve, reject) => {
      /** Drops the paired success observation after a failed bind. */
      function onError(error: Error) {
        server.off('listening', onListening)
        reject(error)
      }
      /** Drops the paired error observation after a successful bind. */
      function onListening() {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
  }
  /** Closes sockets as well as SDK exchanges, including stateless legacy requests. */
  function close() {
    return closing ??= (async () => {
      const stopping = transport?.close()
      const sockets = new Promise<void>((resolve, reject) => {
        server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve())
        server.closeAllConnections()
      })
      await Promise.all([stopping, sockets])
    })()
  }
  try {
    validateMcpToken(options.token)
    try {
      await listen(options.port)
    }
    catch (error) {
      if (options.explicitPort || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      await listen(0)
    }
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('MCP server did not bind a TCP address')
    const origin = `http://127.0.0.1:${address.port}`
    transport = createMcpHttpHandler(options.factory, { mode: 'dev-local', origin, path: '/mcp', token: options.token, principal: options.principal }, options.observeExchange)
    return { server, url: `${origin}/mcp`, close }
  }
  catch (error) {
    await close()
    throw error
  }
}
