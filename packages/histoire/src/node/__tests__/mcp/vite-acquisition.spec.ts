import { createServer as createViteServer } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createViteServers } from '../../server/vite-servers.js'
import { acquireViteServer } from '../../vite/acquire-server.js'
import { getViteConfigWithPlugins } from '../../vite/index.js'

vi.mock('vite', async importOriginal => ({ ...await importOriginal<typeof import('vite')>(), createServer: vi.fn() }))
vi.mock('../../vite/index.js', () => ({ getViteConfigWithPlugins: vi.fn() }))

describe('sequential Vite acquisition', () => {
  beforeEach(() => {
    vi.mocked(getViteConfigWithPlugins).mockResolvedValue({ viteConfig: { server: {} }, viteConfigFile: 'vite.config.ts' } as any)
  })

  /** Server with observed acquisition and cleanup. */
  function server() {
    return { close: vi.fn(async () => {}), pluginContainer: { buildStart: vi.fn(async () => {}) } }
  }

  it('evaluates collector first, then book config without parallel acquisition', async () => {
    const first = server()
    const second = server()
    vi.mocked(createViteServer).mockResolvedValueOnce(first as any).mockResolvedValueOnce(second as any)
    const runtime = await createViteServers({} as any, {})
    expect(vi.mocked(getViteConfigWithPlugins).mock.calls.map(call => call[0])).toEqual([true, false])
    expect(first.pluginContainer.buildStart.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getViteConfigWithPlugins).mock.invocationCallOrder[1])
    expect(runtime.nodeServer).toBe(first)
    expect(runtime.server).toBe(second)
  })

  it.each([true, false, undefined])('preserves client discovery choice %s while collector remains isolated', async (noDiscovery) => {
    vi.mocked(getViteConfigWithPlugins).mockResolvedValue({ viteConfig: { server: {}, optimizeDeps: { include: ['fixture-dependency'], noDiscovery } } } as any)
    vi.mocked(createViteServer).mockResolvedValueOnce(server() as any).mockResolvedValueOnce(server() as any)
    await createViteServers({} as any, {})
    const [collector, client] = vi.mocked(createViteServer).mock.calls.slice(-2).map(call => call[0].optimizeDeps)
    expect(collector.noDiscovery).toBe(true)
    expect(client.noDiscovery).toBe(noDiscovery ?? false)
    expect(collector.include).toEqual(['fixture-dependency'])
    expect(client.include).toEqual(['fixture-dependency'])
  })

  it('closes collector server when creating book server fails', async () => {
    const first = server()
    vi.mocked(createViteServer).mockResolvedValueOnce(first as any).mockRejectedValueOnce(new Error('book acquisition failed'))
    await expect(createViteServers({} as any, {})).rejects.toThrow('book acquisition failed')
    expect(first.close).toHaveBeenCalledOnce()
  })

  it('closes both servers when book buildStart fails', async () => {
    const first = server()
    const second = server()
    second.pluginContainer.buildStart.mockRejectedValueOnce(new Error('plugin buildStart failed'))
    vi.mocked(createViteServer).mockResolvedValueOnce(first as any).mockResolvedValueOnce(second as any)
    await expect(createViteServers({} as any, {})).rejects.toThrow('plugin buildStart failed')
    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
  })

  it('marks failed partial teardown without replacing the startup error', async () => {
    const first = server()
    first.close.mockRejectedValueOnce(new Error('collector close failed'))
    vi.mocked(createViteServer).mockResolvedValueOnce(first as any).mockRejectedValueOnce(new Error('book acquisition failed'))
    const failure = await createViteServers({} as any, {}).catch(error => error)
    expect(failure.name).toBe('RuntimeCleanupError')
    expect(failure.message).toContain('book acquisition failed')
    expect(failure.errors.map((error: Error) => error.message)).toEqual(['book acquisition failed', 'collector close failed'])
  })

  it('captures earliest public server hook and closes it when Vite rejects before returning', async () => {
    const captured = server()
    const original = new Error('configureServer failed')
    vi.mocked(createViteServer).mockImplementationOnce(async (config) => {
      const hook = (config.plugins[0] as any).configureServer
      expect(hook.order).toBe('pre')
      hook.handler(captured)
      throw original
    })
    await expect(acquireViteServer({ plugins: [] })).rejects.toBe(original)
    expect(captured.close).toHaveBeenCalledOnce()
  })

  it('marks failed cleanup of a captured partial Vite server without losing original cause', async () => {
    const captured = server()
    const original = new Error('configureServer failed')
    const cleanup = new Error('partial server close failed')
    captured.close.mockRejectedValueOnce(cleanup)
    vi.mocked(createViteServer).mockImplementationOnce(async (config) => {
      (config.plugins[0] as any).configureServer.handler(captured)
      throw original
    })
    const failure = await acquireViteServer({}).catch(error => error)
    expect(failure.name).toBe('RuntimeCleanupError')
    expect(failure.errors).toEqual([original, cleanup])
  })
})
