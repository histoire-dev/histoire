import { readFile, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedHttpHost, openEmbedWebSocket, pingEmbedWebSocket, readEmbedHttps } from '../utils/embed/http.js'
import { createEmbedVueProject } from '../utils/embed/vue-project.js'

const { createHistoireProject } = await import('../../../../dist/node/api/index.js')
const { getProjectServices } = await import('../../../../dist/node/api/internal.js')

/** Keeps fixture creation canonical; only this test's explicit hosting policy differs. */
async function projectFixture(title: string) {
  const fixture = await createEmbedVueProject(title)
  await fixture.setTitle(title)
  const config = join(fixture.root, 'custom.ts')
  await writeFile(config, (await readFile(config, 'utf8')).replace('export default {', 'export default {mcp:false,'))
  return { ...fixture, project: await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' }) }
}

describe('caller-owned Node middleware', () => {
  it('closes partial Vite acquisition when configureServer throws before factory returns', async () => {
    const fixture = await projectFixture('Partial Vite')
    const host = await createEmbedHttpHost()
    await writeFile(join(fixture.root, 'vite.config.ts'), `
      import vue from '@vitejs/plugin-vue';
      export default {base:'/book/',plugins:[vue(),{
        name:'configure-failure',configureServer(server){
          if(server.config.server.hmr) throw new Error('controlled configureServer failure');
        }
      }]};
    `)
    try {
      await host.listen()
      const handle = await fixture.project.createMiddleware({ httpServer: host.server, base: '/partial/', publicOrigin: host.origin })
      host.middleware.push(handle.middleware)
      await expect(handle.ready).rejects.toThrow('controlled configureServer failure')
      expect(host.server.listeners('upgrade')).toEqual([host.upgrade])
      expect((await fetch(`${host.origin}/host-api`)).status).toBe(200)
      await handle.close()
      expect(host.server.listening).toBe(true)
    }
    finally {
      await fixture.project.close()
      await host.close()
      await fixture.close()
    }
  }, 30_000)

  it('unwinds acquired Vite servers after initial plugin failure without touching host ownership', async () => {
    const fixture = await projectFixture('Failed startup')
    const host = await createEmbedHttpHost()
    const cleanup = join(fixture.root, 'plugin-released')
    const config = join(fixture.root, 'custom.ts')
    const source = await readFile(config, 'utf8')
    await writeFile(config, `import {writeFile} from 'node:fs/promises';\n${source.replace('plugins:[HstVue(),', `plugins:[HstVue(),{name:'startup-failure',onDev(_api,onCleanup){onCleanup(()=>writeFile(${JSON.stringify(cleanup)},'released'));throw new Error('injected startup failure')}},`)}`)
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    try {
      await host.listen()
      const handle = await fixture.project.createMiddleware({ httpServer: host.server, base: '/failed/', publicOrigin: host.origin })
      host.middleware.push(handle.middleware)
      await expect(handle.ready).rejects.toThrow('injected startup failure')
      expect(await readFile(cleanup, 'utf8')).toBe('released')
      expect((await fetch(`${host.origin}/host-api`)).status).toBe(200)
      expect((await fetch(handle.url)).status).toBe(503)
      expect(host.server.listeners('upgrade')).toEqual([host.upgrade])
      await handle.close()
      expect(host.server.listening).toBe(true)
      expect(process.listeners('SIGINT')).toEqual(interrupt)
      expect(process.listeners('SIGTERM')).toEqual(terminate)
    }
    finally {
      await fixture.project.close()
      await host.close()
      await fixture.close()
    }
  }, 30_000)

  it('returns before listening and closes pending readiness without touching caller server', async () => {
    const fixture = await projectFixture('Pending')
    const host = await createEmbedHttpHost()
    try {
      const handle = await fixture.project.createMiddleware({ httpServer: host.server, base: '/pending/', publicOrigin: 'http://localhost:7000' })
      host.middleware.push(handle.middleware)
      expect(host.server.listening).toBe(false)
      const rejected = expect(handle.ready).rejects.toThrow('closed')
      await handle.close()
      await rejected
      await host.listen()
      expect((await fetch(`${host.origin}/host-api`)).status).toBe(200)
      expect(host.server.listeners('upgrade')).toContain(host.upgrade)
    }
    finally {
      await fixture.project.close()
      await host.close()
      await fixture.close()
    }
  }, 30_000)

  it('hosts two bases with real HMR and retains host HTTP/WebSocket across restart and close', async () => {
    const first = await projectFixture('First')
    const second = await projectFixture('Second')
    const host = await createEmbedHttpHost()
    let unrelated: WebSocket | undefined
    let hmr: WebSocket | undefined
    try {
      const origin = await host.listen()
      const one = await first.project.createMiddleware({ httpServer: host.server, base: '/one/', publicOrigin: origin })
      const two = await second.project.createMiddleware({ httpServer: host.server, base: '/two/', publicOrigin: origin })
      host.middleware.push(one.middleware, two.middleware)
      await Promise.all([one.ready, two.ready])
      expect((await fetch(`${origin}/one/`)).status).toBe(200)
      expect((await fetch(`${origin}/two/`)).status).toBe(200)
      expect((await fetch(`${origin}/one-other/`)).status).toBe(404)
      expect(getProjectServices(first.project).dev.controller.current.server.config.server.hmr.server).toBe(host.server)
      unrelated = await openEmbedWebSocket(`${origin.replace('http:', 'ws:')}/host-ws`)
      hmr = await openEmbedWebSocket(`${origin.replace('http:', 'ws:')}/one/__histoire/hmr`, 'vite-hmr')
      expect(await pingEmbedWebSocket(unrelated)).toBe('pong')
      const identity = one.middleware
      const old = getProjectServices(first.project).dev.controller.current
      await one.restart()
      expect(one.middleware).toBe(identity)
      expect(old.isActive()).toBe(false)
      expect(await pingEmbedWebSocket(unrelated)).toBe('pong')
      expect((await fetch(`${origin}/host-api`)).status).toBe(200)
      const stream = await new Promise<import('node:http').IncomingMessage>((resolve) => {
        get(`${origin}/host-stream`, response => response.once('data', () => resolve(response)))
      })
      await one.close()
      expect(stream.destroyed).toBe(false)
      const finished = new Promise<void>(resolve => stream.once('end', resolve))
      host.finishStream()
      await finished
      expect(host.server.listening).toBe(true)
      expect(host.server.listeners('upgrade')).toContain(host.upgrade)
      expect(await pingEmbedWebSocket(unrelated)).toBe('pong')
      expect((await fetch(`${origin}/two/`)).status).toBe(200)
      await two.close()
      expect(host.server.listeners('upgrade')).toEqual([host.upgrade])
      expect(await pingEmbedWebSocket(unrelated)).toBe('pong')
    }
    finally {
      hmr?.close()
      unrelated?.close()
      await Promise.all([first.project.close(), second.project.close()])
      await host.close()
      await Promise.all([first.close(), second.close()])
    }
  }, 60_000)

  it('binds HTTPS HMR to supplied server and leaves host available after startup/restart failure', async () => {
    const fixture = await projectFixture('HTTPS')
    const host = await createEmbedHttpHost(true)
    try {
      await host.listen()
      const handle = await fixture.project.createMiddleware({ httpServer: host.server, base: '/secure/', publicOrigin: host.origin })
      host.middleware.push(handle.middleware)
      await handle.ready
      expect((await readEmbedHttps(handle.url)).status).toBe(200)
      const runtime = getProjectServices(fixture.project).dev.controller.current
      expect(runtime.server.config.server.hmr.server).toBe(host.server)
      expect(runtime.server.config.server.hmr.protocol).toBe('wss')
      await writeFile(join(fixture.root, 'custom.ts'), `throw new Error('injected restart failure'); export default {}`)
      await expect(handle.restart()).rejects.toThrow('injected restart failure')
      expect((await readEmbedHttps(`${host.origin}/host-api`)).status).toBe(200)
      expect((await readEmbedHttps(handle.url)).status).toBe(503)
      await handle.close()
      expect(host.server.listeners('upgrade')).toEqual([host.upgrade])
      expect(host.server.listening).toBe(true)
      await vi.waitFor(() => expect(runtime.isActive()).toBe(false))
    }
    finally {
      await fixture.project.close()
      await host.close()
      await fixture.close()
    }
  }, 60_000)
})
