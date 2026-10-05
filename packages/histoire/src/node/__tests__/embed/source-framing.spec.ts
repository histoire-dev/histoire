import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBuiltEmbedPolicy } from '../../config/embed-built.js'
import { createEmbedMiddleware } from '../../virtual/embed/middleware.js'
import { prepareEmbedOutput, writeEmbedDescriptor } from '../../virtual/embed/output.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('source framing and deployment policy', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('resolves static and Node deployment origin replacement without rebuilding source', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const prepared = await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')
    await writeEmbedDescriptor(fixture.context, prepared, fixture.root, 'build')
    expect((await readBuiltEmbedPolicy(fixture.root, { target: 'static' })).header).toContain('https://host.test:8443')
    await writeFile(join(fixture.root, 'histoire-embed-origins.json'), JSON.stringify({ version: 1, allowedOrigins: ['https://deployed.test'] }))
    expect((await readBuiltEmbedPolicy(fixture.root, { target: 'static' })).header).toBe('frame-ancestors \'self\' https://deployed.test')
    expect((await readBuiltEmbedPolicy(fixture.root, { target: 'node', originOverride: 'https://node.test, https://other.test:9443' })).header).toBe('frame-ancestors \'self\' https://node.test https://other.test:9443')
    await writeFile(join(fixture.root, 'histoire-embed-origins.json'), 'invalid JSON')
    expect((await readBuiltEmbedPolicy(fixture.root, { target: 'static' })).header).toBe('frame-ancestors \'self\'')
    expect((await readBuiltEmbedPolicy(fixture.root, { target: 'node', originOverride: '*' })).header).toBe('frame-ancestors \'self\'')
  })

  it('sets dev framing header before document/errors and blocks disabled embed HTML fallback', async () => {
    const server = { config: { base: '/nested/book/' }, transformIndexHtml: vi.fn(async (_url: string, html: string) => html) }
    const res = { setHeader: vi.fn(), end: vi.fn(), statusCode: 200 }
    const next = vi.fn()
    const enabled = createEmbedMiddleware(server as any, fixture.context)
    await enabled({ url: '/nested/book/index.html' } as any, res as any, next)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', 'frame-ancestors \'self\' https://host.test:8443')
    server.transformIndexHtml.mockRejectedValueOnce(new Error('transform failed'))
    await enabled({ url: '/nested/book/__embed.html?view=bridge' } as any, res as any, next)
    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenLastCalledWith(JSON.stringify({ code: 'SOURCE_UNAVAILABLE', message: 'Source content is unavailable' }))
    fixture.context.config.embed = { enabled: false }
    const disabled = createEmbedMiddleware(server as any, fixture.context)
    next.mockClear()
    res.setHeader.mockClear()
    await disabled({ url: '/nested/book/__embed.html' } as any, res as any, next)
    expect(res.statusCode).toBe(404)
    expect(next).not.toHaveBeenCalled()
    expect(res.setHeader.mock.calls.some(call => call[0] === 'Content-Security-Policy')).toBe(false)
  })

  it('inherits configured headers and preserves host policy while changing only framing directive', async () => {
    const server = { config: { base: '/nested/book/', server: { headers: { 'Content-Security-Policy': 'script-src \'self\'', 'X-Book': 'configured' } } }, transformIndexHtml: async (_url: string, html: string) => html }
    const headers = new Map<string, unknown>([['content-security-policy', 'connect-src \'self\'; frame-ancestors \'none\'']])
    const res = { getHeader: (name: string) => headers.get(name.toLowerCase()), setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value), end: vi.fn(), statusCode: 200 }
    await createEmbedMiddleware(server as any, fixture.context)({ url: '/nested/book/__embed.html' } as any, res as any, vi.fn())
    expect(headers.get('content-security-policy')).toBe('connect-src \'self\'; frame-ancestors \'self\' https://host.test:8443')
    expect(headers.get('x-book')).toBe('configured')
    fixture.context.config.embed = { enabled: false }
    headers.clear()
    await createEmbedMiddleware(server as any, fixture.context)({ url: '/nested/book/__embed.html' } as any, res as any, vi.fn())
    expect(headers.get('content-security-policy')).toBe('script-src \'self\'')
  })
})
