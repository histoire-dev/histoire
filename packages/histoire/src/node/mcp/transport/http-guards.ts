import type { IncomingMessage, ServerResponse } from 'node:http'

/** Transport policy shared by separate local dev and mounted production listeners. */
export interface McpHttpPolicy {
  /** Local allows absent token; protected production requires one. */
  mode: 'dev-local' | 'protected-node'
  /** Canonical public endpoint origin, never derived from forwarded headers. */
  origin: string
  /** Exact mounted MCP path, including deployment base. */
  path: string
  /** Optional local or required production machine credential. */
  token?: string
  /** Controller-local or verified machine identity for operation ownership. */
  principal: string
}

/** Writes small constant diagnostics that cannot echo request input or credentials. */
export function rejectMcpHttp(response: ServerResponse, status: number, message: string): false {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}), ...(status === 429 ? { 'Retry-After': '1' } : {}) })
  response.end(JSON.stringify({ error: message }))
  return false
}

/** Validates canonical policy once; this server does not trust proxy-derived origins. */
export function validateMcpHttpPolicy(policy: McpHttpPolicy): URL {
  const origin = new URL(policy.origin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== policy.origin || origin.username || origin.password) throw new Error('MCP origin must be a canonical HTTP(S) origin')
  if (!policy.path.startsWith('/') || /[?#\\\s]/.test(policy.path)) throw new Error('MCP path must be an absolute URL path without query or fragment')
  if (policy.mode === 'dev-local' && (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1')) throw new Error('Dev MCP must bind to 127.0.0.1')
  return origin
}

/** Requires exact Host and browser Origin; native clients without Origin remain allowed. */
export function guardMcpHttp(request: IncomingMessage, response: ServerResponse, policy: McpHttpPolicy): boolean {
  if (request.url !== policy.path) return rejectMcpHttp(response, 404, 'MCP endpoint not found')
  if (request.headers.host !== new URL(policy.origin).host) return rejectMcpHttp(response, 403, 'MCP Host rejected')
  const origin = request.headers.origin
  if (origin !== undefined && origin !== policy.origin) return rejectMcpHttp(response, 403, 'MCP Origin rejected')
  return true
}
