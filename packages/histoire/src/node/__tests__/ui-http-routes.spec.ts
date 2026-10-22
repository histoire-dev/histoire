import type { AcpManager } from '../acp/manager.js'
import type { Context } from '../context.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createProjectFileIndex } from '../comments/files-search.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { registerAgentEnvironment } from '../server/ui-channel/agents-env.js'
import { createUiChannel } from '../server/ui-channel/channel.js'
import { registerCommentsHttp } from '../server/ui-channel/comments-http.js'
import { saveScreenshotFile } from '../server/ui-channel/files.js'
import { installUiHttpRouter, uiHttpPath } from '../server/ui-channel/http.js'
import { registerScreenshotChannel } from '../server/ui-channel/screenshot.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'
import { PREVIEW_PNG } from './utils/mcp/preview-browser.js'

describe('early dev UI HTTP route ownership', () => {
  it.each(['/', '/book/'])('serves late screenshot routes ahead of real Vite SPA fallback at base %s', async (base) => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-http-'))
    await writeFile(join(root, 'index.html'), '<!doctype html><main>SPA fallback</main>')
    const server = await createServer({ root, base, configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { port: 0, host: '127.0.0.1', hmr: false }, plugins: [{ name: 'ui-http-boundary', configureServer: installUiHttpRouter }] })
    const execution = createExecutionService()
    let active = true
    const channel = createUiChannel(server, () => active)
    try {
      // Register after createServer has finalized its middleware stack, exactly
      // when generation feature initialization runs in ordinary Histoire dev.
      registerScreenshotChannel({ root, mode: 'dev' } as Context, server, channel, execution, () => active)
      const file = await saveScreenshotFile(root, { storyId: 'story', variantId: 'variant' }, 'png', PREVIEW_PNG)
      await server.listen()
      const origin = new URL(server.resolvedUrls!.local[0]).origin
      const path = uiHttpPath(server, `/__histoire/screenshots/${file.path.split('/').pop()}`)
      const image = await fetch(`${origin}${path}`)
      expect(image.status).toBe(200)
      expect(image.headers.get('content-type')).toBe('image/png')
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(Uint8Array.from(PREVIEW_PNG))
      expect((await fetch(`${origin}${uiHttpPath(server, '/__histoire/screenshots/missing.png')}`)).status).toBe(404)
      expect((await fetch(`${origin}${base}unknown-story`)).status).toBe(200)
      active = false
      expect((await fetch(`${origin}${path}`)).status).toBe(404)
      await channel.close()
      expect((await fetch(`${origin}${path}`)).status).toBe(404)
    }
    finally {
      await channel.close()
      await execution.close()
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('dispatches late write-only routes and refuses unregistered reserved paths', async () => {
    const server = await createServer({ base: '/book/', configFile: false, root: tmpdir(), logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { port: 0, host: '127.0.0.1', hmr: false }, plugins: [{ name: 'ui-http-boundary', configureServer: installUiHttpRouter }] })
    const path = uiHttpPath(server, '/__histoire/agents/environment')
    const setEnvironment = vi.fn(async () => {})
    const remove = registerAgentEnvironment({ mode: 'dev' } as Context, server, { setEnvironment } as unknown as AcpManager, () => true)
    try {
      await server.listen()
      const origin = new URL(server.resolvedUrls!.local[0]).origin
      const body = JSON.stringify({ agentId: 'agent', env: { TOKEN: 'private-secret' } })
      const accepted = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'origin': origin, 'content-type': 'application/json' }, body })
      expect(accepted.status).toBe(204)
      expect(setEnvironment).toHaveBeenCalledWith('agent', { TOKEN: 'private-secret' })
      const refused = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'origin': 'http://evil.example', 'content-type': 'application/json' }, body })
      expect(refused.status).toBe(403)
      expect(await refused.text()).not.toContain('private-secret')
      expect(setEnvironment).toHaveBeenCalledOnce()
      expect((await fetch(`${origin}${path}`)).status).toBe(403)
      expect((await fetch(`${origin}${path}/unknown`, { method: 'POST' })).status).toBe(404)
      remove()
      expect((await fetch(`${origin}${path}`, { method: 'POST' })).status).toBe(404)
    }
    finally { await server.close() }
  })

  it('guards comment uploads and downloads', async () => {
    const { root } = await configTestProject()
    const server = await createServer({ root, configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { port: 0, host: '127.0.0.1', hmr: false }, plugins: [{ name: 'ui-http-boundary', configureServer: installUiHttpRouter }] })
    registerCommentsHttp({ root, mode: 'dev' } as Context, server, createProjectFileIndex(root), () => true)
    try {
      await server.listen()
      const origin = new URL(server.resolvedUrls!.local[0]).origin
      const upload = `${origin}/__histoire/comments/attachments?name=notes.txt&type=text%2Fplain`
      const octet = { 'content-type': 'application/octet-stream' }
      expect((await fetch(upload, { method: 'POST', headers: { ...octet, origin: 'http://evil.example' }, body: 'x' })).status).toBe(403)
      expect((await fetch(upload, { method: 'POST', headers: { 'origin': origin, 'content-type': 'text/plain' }, body: 'x' })).status).toBe(403)
      const large = await fetch(upload, { method: 'POST', headers: { ...octet, origin }, body: new Uint8Array(10 * 1024 * 1024 + 1) })
      expect(large.status).toBe(400)
      expect(await large.json()).toEqual({ error: 'Attachment exceeds 10 MB' })
      const saved = await (await fetch(upload, { method: 'POST', headers: { ...octet, origin }, body: 'hello' })).json()
      const download = await fetch(`${origin}/__histoire/comments/attachments/${saved.path.split('/').pop()}`)
      expect(download.status).toBe(200)
      expect(download.headers.get('content-disposition')).toBe('attachment')
      expect(await download.text()).toBe('hello')
      expect((await fetch(`${origin}/__histoire/comments/attachments/..%2Fcomments.json`)).status).toBe(404)
      // Stored screenshots become attachments without a browser round trip.
      const screenshot = await saveScreenshotFile(root, { storyId: 'story', variantId: 'variant' }, 'png', PREVIEW_PNG)
      const copy = `${origin}/__histoire/comments/attachments/from-screenshot`
      const json = { 'content-type': 'application/json' }
      expect((await fetch(copy, { method: 'POST', headers: { ...json, origin: 'http://evil.example' }, body: JSON.stringify({ path: screenshot.path }) })).status).toBe(403)
      expect((await fetch(copy, { method: 'POST', headers: { ...json, origin }, body: JSON.stringify({ path: '.histoire/screenshots/missing.png' }) })).status).toBe(400)
      const attached = await (await fetch(copy, { method: 'POST', headers: { ...json, origin }, body: JSON.stringify({ path: screenshot.path }) })).json()
      expect(attached).toMatchObject({ name: screenshot.path.split('/').pop(), mimeType: 'image/png', size: PREVIEW_PNG.byteLength })
      expect(attached.path).toMatch(/^\.histoire\/attachments\//)
    }
    finally {
      await server.close()
      await disposeConfigProjects()
    }
  })
})
