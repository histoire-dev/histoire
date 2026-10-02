import { Buffer } from 'node:buffer'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { describe, expect, it, vi } from 'vitest'
import { captureMcpToken, createMcpTokenVerifier, validateMcpToken } from '../../mcp/transport/http-auth.js'
import { MCP_HTTP_BODY_BYTES } from '../../mcp/transport/http-body.js'
import { createMcpHttpHandler } from '../../mcp/transport/http.js'
import { createMcpHttpFixture, createMcpHttpProbe, requestMcpHttp } from '../utils/mcp/http.js'

const token = 'a1'.repeat(32)

describe('mCP HTTP trust boundary', () => {
  it('captures and removes token before project environment is evaluated', () => {
    const environment = { HISTOIRE_MCP_TOKEN: token, OTHER: 'public' }
    expect(captureMcpToken(environment)).toBe(token)
    expect(environment).toEqual({ OTHER: 'public' })
    expect(() => validateMcpToken(undefined)).not.toThrow()
    expect(() => validateMcpToken(undefined, true)).toThrow('required')
    expect(() => validateMcpToken('short')).toThrow('at least 32 bytes')
    expect(() => validateMcpToken(Buffer.alloc(32, 1).toString('base64url'))).not.toThrow()
    expect(createMcpTokenVerifier(token)(`Bearer ${token}`)).toBe(true)
    expect(createMcpTokenVerifier(token)(`Bearer ${token.slice(2)}`)).toBe(false)
  })

  it('rejects invalid configured local credentials and missing protected credentials', async () => {
    await expect(createMcpHttpFixture({ token: 'short' })).rejects.toThrow('at least 32 bytes')
    expect(() => createMcpHttpHandler(createMcpHttpProbe(), { mode: 'protected-node', origin: 'https://stories.example.com', path: '/mcp', principal: 'machine' })).toThrow('required')
  })

  it('requires exact Host/Origin/path and bearer before protocol dispatch', async () => {
    const fixture = await createMcpHttpFixture({ token })
    try {
      for (const headers of [{ Host: 'attacker.example' }, { Origin: 'https://attacker.example' }, { Origin: 'null' }, { Origin: 'http://127.0.0.1:6006' }]) {
        const result = await requestMcpHttp(fixture.url, { headers: { Authorization: `Bearer ${token}`, ...headers } })
        expect(result.status).toBe(403)
        expect(result.text).not.toContain(token)
      }
      expect((await requestMcpHttp(`${fixture.url}?token=${token}`)).status).toBe(404)
      expect((await requestMcpHttp(fixture.url.replace('/mcp', '/other'))).status).toBe(404)
      expect((await requestMcpHttp(fixture.url)).status).toBe(401)
      expect((await requestMcpHttp(fixture.url, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
      const accepted = await requestMcpHttp(fixture.url, { headers: { Authorization: `Bearer ${token}`, Origin: new URL(fixture.url).origin }, chunks: [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })] })
      expect(accepted.status).toBe(200)
      expect(accepted.headers['access-control-allow-origin']).toBeUndefined()
      expect((await (await fixture.client()).listTools()).tools).toHaveLength(1)
    }
    finally { await fixture.close() }
  })

  it.each(['2026-07-28', '2025-11-25'] as const)('forwards verified machine identity through SDK authInfo for %s', async (revision) => {
    const probe = createMcpHttpProbe()
    const identities: Array<string | undefined> = []
    const fixture = await createMcpHttpFixture({ token, factory: (context) => {
      identities.push(context.authInfo?.clientId)
      return probe(context)
    } })
    try {
      const client = await fixture.client(revision)
      const result = await client.callTool({ name: 'probe', arguments: { value: 'public result' } })
      expect(identities.length).toBeGreaterThan(0)
      expect(identities.every(identity => identity === 'http-test')).toBe(true)
      expect(JSON.stringify(result)).not.toContain(token)
    }
    finally { await fixture.close() }
  })

  it('measures chunked UTF-8 bytes and rejects oversized declared bodies without crashing', async () => {
    const fixture = await createMcpHttpFixture()
    try {
      const oversized = await requestMcpHttp(fixture.url, { chunks: ['"', 'é'.repeat(MCP_HTTP_BODY_BYTES / 2), '"'] })
      expect(oversized.status).toBe(413)
      expect((await requestMcpHttp(fixture.url, { headers: { 'Content-Length': String(MCP_HTTP_BODY_BYTES + 1) }, chunks: ['{}'] })).status).toBe(413)
      expect((await requestMcpHttp(fixture.url, { chunks: ['{invalid json'] })).status).toBe(400)
      expect((await (await fixture.client()).listTools()).tools).toHaveLength(1)
    }
    finally { await fixture.close() }
  })

  it('sDK adapter enforces actual bytes even when stream declares a smaller Content-Length', async () => {
    const fetch = vi.fn()
    const dispatch = toNodeHandler({ fetch }, { maxRequestBodySize: MCP_HTTP_BODY_BYTES })
    const request = {
      method: 'POST',
      url: '/mcp',
      headers: { 'host': '127.0.0.1', 'content-length': '1' },
      async* [Symbol.asyncIterator]() { yield Buffer.alloc(MCP_HTTP_BODY_BYTES + 1) },
    }
    const response = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn() }
    await dispatch(request, response)
    expect(response.writeHead).toHaveBeenCalledWith(413, expect.any(Object))
    expect(fetch).not.toHaveBeenCalled()
  })
})
