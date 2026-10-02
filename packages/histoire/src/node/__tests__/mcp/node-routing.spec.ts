import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicRequestPath } from '../../deploy/routes.js'
import { createNodeServer } from '../../deploy/server.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'
import { requestMcpHttp } from '../utils/mcp/http.js'

describe('node public routing and authorization', () => {
  let fixture: Awaited<ReturnType<typeof createMcpArtifactFixture>>
  let runtime: Awaited<ReturnType<typeof createNodeServer>>
  beforeEach(async () => {
    fixture = await createMcpArtifactFixture('/book/')
    runtime = await createNodeServer({ artifactDirectory: fixture.root, environment: { HOST: '127.0.0.1', PORT: '0', PUBLIC_ORIGIN: 'https://book.example', HISTOIRE_MCP_TOKEN: 'ab'.repeat(32) }, arguments: [] })
  })
  afterEach(async () => {
    await runtime?.close()
    await fixture.close()
  })

  it('matches encoded deployment bases after one consistent decode', () => {
    expect(publicRequestPath('/book%20path/asset.js', '/book%20path/')).toBe('asset.js')
    expect(publicRequestPath('/book%20path/%252e%252e/private', '/book%20path/')).toBeUndefined()
  })

  it.each(['/book%20space/', '/%E9%9B%AA/'])('serves canonical encoded artifact base %s', async (base) => {
    const encoded = await createMcpArtifactFixture(base)
    let listener: Awaited<ReturnType<typeof createNodeServer>> | undefined
    try {
      listener = await createNodeServer({ artifactDirectory: encoded.root, environment: { HOST: '127.0.0.1', PORT: '0' }, arguments: ['--no-mcp'] })
      expect(encoded.manifest.base).toBe(base)
      expect((await requestMcpHttp(listener.origin, { method: 'GET', path: `${base}asset.js` })).status).toBe(200)
      expect((await requestMcpHttp(listener.origin, { method: 'GET', path: `${base}__histoire/ready` })).status).toBe(200)
    }
    finally {
      await listener?.close()
      await encoded.close()
    }
  })

  it('serves base assets and HTML navigation without asset/API fallback', async () => {
    expect(await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/asset.js' })).toMatchObject({ status: 200, text: 'export const asset = true' })
    expect(await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/story/story-a', headers: { Accept: 'text/html' } })).toMatchObject({ status: 200, text: '<html>Book</html>' })
    for (const path of ['/book/missing.js', '/book/assets/missing', '/book/api/missing', '/book/story/story-a']) expect((await requestMcpHttp(runtime.origin, { method: 'GET', path })).status).toBe(404)
  })

  it.each(['/book/private/manifest.json', '/book/server.mjs', '/book/package.json', '/book/.env', '/book/../private/manifest.json', '/book/%2e%2e/private/manifest.json', '/book/%252e%252e/private/manifest.json', '/book/%2f..%2fprivate/manifest.json', '/book/%00', '/book/__histoire/preview/expired.html', '/book/__histoire/mcp?x=1'])('refuses %s before history fallback', async (path) => {
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path, headers: { Accept: 'text/html' } })).status).toBe(404)
  })

  it('refuses public symlink swaps after validated startup', async () => {
    const { unlink } = await import('node:fs/promises')
    await unlink(join(fixture.publicDir, 'asset.js'))
    await symlink(join(fixture.privateDir, 'manifest.json'), join(fixture.publicDir, 'asset.js'))
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/asset.js' })).status).toBe(503)
  })

  it('rejects bad token, Host and Origin; public URLs ignore forwarded headers', async () => {
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/__histoire/mcp', headers: { Host: 'book.example' } })).status).toBe(401)
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/__histoire/mcp', headers: { Host: 'evil.example', Authorization: `Bearer ${'ab'.repeat(32)}` } })).status).toBe(403)
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/__histoire/mcp', headers: { Host: 'book.example', Origin: 'https://evil.example', Authorization: `Bearer ${'ab'.repeat(32)}` } })).status).toBe(403)
    expect(await runtime.project.getPreview({ storyId: 'story-a', variantId: 'default' })).toMatchObject({ storyUrl: 'https://book.example/book/story/story-a?variantId=default' })
    expect((await requestMcpHttp(runtime.origin, { method: 'GET', path: '/book/__histoire/health', headers: { 'X-Forwarded-Host': 'evil.example' } })).text).not.toContain('evil')
  })
})
