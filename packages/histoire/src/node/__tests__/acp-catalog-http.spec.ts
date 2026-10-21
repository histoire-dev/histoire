import type { Context } from '../context.js'
import { createServer as createHttpServer } from 'node:http'
import { join } from 'pathe'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { registerAgentsCatalog } from '../server/ui-channel/agents-catalog.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'
import { disposeAgentManagers, fakeManager } from './utils/acp.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('dev catalog HTTP boundary', () => {
  it('routes nested registry refresh and discovery, rejects foreign POSTs, and never changes presets', async () => {
    let loads = 0
    const { root: cacheRoot } = await configTestProject()
    const { root, manager } = await fakeManager('config-options', true, undefined, { registry: { cacheDir: join(cacheRoot, 'registry'), fetch: async () => {
      loads++
      return new Response(JSON.stringify({ agents: Array.from({ length: 40 }, (_, index) => ({ id: `agent-${index}`, name: `Agent ${index}`, distribution: { npx: { package: 'agent@1' } } })) }))
    } } })
    const vite = await createServer({ root, configFile: false, base: '/nested/', server: { middlewareMode: true }, logLevel: 'silent', plugins: [{ name: 'catalog-http-boundary', configureServer: installUiHttpRouter }] })
    const http = createHttpServer(vite.middlewares)
    let active = true
    let cleanup = () => {}
    try {
      cleanup = registerAgentsCatalog({ mode: 'dev' } as Context, vite, manager, () => active)
      await new Promise<void>((resolve) => {
        http.listen(0, '127.0.0.1', resolve)
      })
      const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`
      /** Genuine HTTP caller exercises Vite base and same-origin validation. */
      function request(path: string, body?: unknown, requestOrigin = origin) {
        return fetch(`${origin}/nested/__histoire/agents/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Origin': requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      const before = manager.snapshot().presets
      expect((await (await request('registry')).json()).entries).toHaveLength(40)
      expect((await (await request('registry/refresh', {})).json()).status.state).toBe('fresh')
      expect(loads).toBe(2)
      expect((await request('config-options', { agentId: 'fake' }, 'http://foreign.test')).status).toBe(403)
      expect((await request('config-options', { agentId: 'fake', archive: 'https://foreign.test/evil.zip' })).status).toBe(400)
      const choices = await (await request('config-options', { agentId: 'fake' })).json()
      expect(choices.model.options.map((option: { value: string }) => option.value)).toEqual(['small', 'large'])
      expect(manager.snapshot().presets).toEqual(before)
      await manager.configure({ ...manager.snapshot(), presets: [{ ...before[0], command: 'histoire-missing-test-agent' }] })
      expect(await (await request('config-options', { agentId: 'fake' })).json()).toEqual({ error: 'Agent command "histoire-missing-test-agent" is not installed' })
      active = false
      expect((await request('registry')).status).toBe(404)
    }
    finally {
      cleanup()
      await new Promise<void>((resolve) => {
        http.close(() => resolve())
        http.closeAllConnections()
      })
      await vite.close()
    }
  })

  it('serves cached registry SVG logos same-origin and refuses unusable ones', async () => {
    const fetched: string[] = []
    const { root: cacheRoot } = await configTestProject()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16z"/></svg>'
    const { root, manager } = await fakeManager('icons', true, undefined, { registry: { cacheDir: join(cacheRoot, 'registry'), fetch: async (input) => {
      const url = String(input)
      fetched.push(url)
      if (url.endsWith('registry.json')) {
        return new Response(JSON.stringify({ agents: [
          { id: 'good', name: 'Good', icon: 'https://cdn.test/good.svg' },
          { id: 'html', name: 'Html', icon: 'https://cdn.test/html.svg' },
          { id: 'none', name: 'None' },
        ].map(entry => ({ ...entry, distribution: { npx: { package: 'agent@1' } } })) }))
      }
      return new Response(url.endsWith('good.svg') ? svg : '<html><script>alert(1)</script></html>')
    } } })
    const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, logLevel: 'silent', plugins: [{ name: 'icon-http', configureServer: installUiHttpRouter }] })
    const http = createHttpServer(vite.middlewares)
    const cleanup = registerAgentsCatalog({ mode: 'dev' } as Context, vite, manager, () => true)
    try {
      await new Promise<void>((resolve) => {
        http.listen(0, '127.0.0.1', resolve)
      })
      const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`
      const good = await fetch(`${origin}/__histoire/agents/icon/good`)
      expect(good.headers.get('content-type')).toBe('image/svg+xml')
      expect(good.headers.get('content-security-policy')).toContain('default-src \'none\'')
      expect(await good.text()).toBe(svg)
      await fetch(`${origin}/__histoire/agents/icon/good`)
      expect(fetched.filter(url => url.endsWith('good.svg'))).toHaveLength(1)
      for (const id of ['html', 'none', 'unknown', '..%2Fx', '%E0%A4%A']) expect((await fetch(`${origin}/__histoire/agents/icon/${id}`)).status).toBe(404)
    }
    finally {
      cleanup()
      await new Promise<void>((resolve) => {
        http.close(() => resolve())
        http.closeAllConnections()
      })
      await vite.close()
    }
  })
})
