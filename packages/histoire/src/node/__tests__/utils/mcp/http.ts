import type { ClientOptions } from '@modelcontextprotocol/client'
import type { McpServerFactory } from '@modelcontextprotocol/server'
import type { Buffer } from 'node:buffer'
import { request } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod/v4'
import { startDevMcpHttp } from '../../../mcp/transport/http.js'

/** Minimal real SDK tool factory shared by transport security and concurrency checks. */
export function createMcpHttpProbe(run: (value: string) => Promise<string> = async value => value): McpServerFactory {
  return () => {
    const server = new McpServer({ name: 'http-probe', version: '1.0.0' })
    server.registerTool('probe', { inputSchema: z.strictObject({ value: z.string() }) }, async ({ value }) => ({ content: [{ type: 'text', text: await run(value) }] }))
    return server
  }
}

/** Owns loopback listener and all official clients created by a transport spec. */
export async function createMcpHttpFixture(options: { factory?: McpServerFactory, token?: string, port?: number, explicitPort?: boolean } = {}) {
  const listener = await startDevMcpHttp({ enabled: true, port: options.port ?? 0, explicitPort: options.explicitPort ?? true, factory: options.factory ?? createMcpHttpProbe(), principal: 'http-test', token: options.token })
  const clients: Client[] = []
  return {
    ...listener,
    /** Stops server while clients still own in-flight protocol calls. */
    stop: listener.close,
    /** Connects promised modern/legacy revision through the published SDK transport. */
    async client(revision: '2026-07-28' | '2025-11-25' = '2026-07-28', token = options.token) {
      const clientOptions: ClientOptions = { supportedProtocolVersions: [revision], versionNegotiation: { mode: revision === '2026-07-28' ? { pin: revision } : 'legacy' } }
      const client = new Client({ name: 'histoire-http-spec', version: '1.0.0' }, clientOptions)
      clients.push(client)
      await client.connect(new StreamableHTTPClientTransport(new URL(listener.url), { requestInit: token === undefined ? undefined : { headers: { Authorization: `Bearer ${token}` } } }))
      return client
    },
    /** Closes clients before listener so pending request errors stay observed. */
    async close() {
      await Promise.allSettled(clients.map(client => client.close()))
      await listener.close()
    },
  }
}

/** Sends exact headers and chunked byte uploads without browser Origin defaults. */
export function requestMcpHttp(url: string, options: { method?: string, path?: string, headers?: Record<string, string>, chunks?: Array<string | Buffer> } = {}) {
  return new Promise<{ status: number, text: string, headers: Record<string, unknown> }>((resolve, reject) => {
    const upload = request(url, { method: options.method ?? 'POST', ...(options.path === undefined ? {} : { path: options.path }), headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...options.headers } }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', chunk => text += chunk)
      response.on('end', () => resolve({ status: response.statusCode!, text, headers: response.headers }))
      response.on('error', reject)
    })
    upload.on('error', reject)
    for (const chunk of options.chunks ?? []) upload.write(chunk)
    upload.end()
  })
}
