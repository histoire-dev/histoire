import { describe, expect, it, vi } from 'vitest'
import { resolvedSupportPluginsClient } from '../virtual/resolved-support-plugins-client.js'
import { createMcpContext } from './utils/mcp/project.js'

/** Execute emitted lazy factory, substituting its module transport only. */
function createClients(load: () => Promise<unknown>) {
  const context = createMcpContext(process.cwd())
  context.supportPlugins = [{ id: 'test', moduleName: 'histoire' }] as any
  const source = resolvedSupportPluginsClient(context).replace(/\bimport\(/g, 'load(').replace(/^[ \t]*export /gm, '')
  // eslint-disable-next-line no-new-func -- execute trusted generated loader glue with an injected module transport
  return new Function('load', `${source};return clientSupportPlugins`)(load)
}

describe('runtime support module ownership', () => {
  it('shares one lazy module acquisition between mount and render consumers', async () => {
    let resolve: (module: object) => void
    const module = { MountStory: {}, RenderStory: {} }
    const load = vi.fn(() => new Promise(done => resolve = done))
    const clients = createClients(load)
    expect(load).not.toHaveBeenCalled()
    const mount = clients.test()
    const render = clients.test()
    expect(load).toHaveBeenCalledTimes(1)
    expect(mount).toBe(render)
    resolve!(module)
    expect(await render).toBe(module)
  })

  it('keeps rejected acquisition owned rather than retrying execution', async () => {
    const error = new Error('Support runtime failed')
    const load = vi.fn(() => Promise.reject(error))
    const clients = createClients(load)
    await expect(clients.test()).rejects.toBe(error)
    await expect(clients.test()).rejects.toBe(error)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
