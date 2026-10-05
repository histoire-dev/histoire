import type { Context } from '../../context.js'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_SOURCE_ID } from '../../virtual/embed/virtual.js'
import { createVirtualFilesPlugin } from '../../virtual/vite-plugin.js'
import { evaluateVirtualModule } from '../utils/embed/virtual-module.js'

/** Evaluate real generated bootstrap under intentionally misleading development environment. */
async function bootstrap(command: 'serve' | 'build', pathname = '/book/story/example') {
  const plugin = createVirtualFilesPlugin({ mode: 'dev' } as Context, false)
  const resolved = plugin.configResolved as (config: any) => void
  resolved?.({ command })
  const source = await (plugin.load as any).call({}, `/__resolved__${LOCAL_SOURCE_ID}`)
  const handlers = new Map<string, (...args: any[]) => void>()
  const hot = { on: (name: string, listener: (...args: any[]) => void) => handlers.set(name, listener), off: (name: string) => handlers.delete(name) }
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ sourceId: 'fixture' }) }))
  const module = evaluateVirtualModule<{ loadDescriptor: () => Promise<unknown>, subscribeSource: (listener: (...args: any[]) => void) => () => void }>(source, { 'import.meta.env.BASE_URL': '"/book/"', 'import.meta.env.DEV': 'true', 'import.meta.hot': 'hot' }, { hot, fetch, location: { origin: 'https://source.example', pathname } })
  return { module, handlers, fetch }
}

describe('local source bootstrap command and reload ownership', () => {
  it.each([['build', 'assets/histoire-local.json'], ['serve', '__histoire/local/descriptor.json']] as const)('reads correct descriptor for %s independent of NODE_ENV', async (command, path) => {
    const fixture = await bootstrap(command)
    expect(await fixture.module.loadDescriptor()).toEqual({ sourceId: 'fixture' })
    expect(fixture.fetch.mock.calls[0][0].href).toBe(`https://source.example/book/${path}`)
  })

  it('retires only documents that Vite reloads, and releases publication subscriptions', async () => {
    const fixture = await bootstrap('serve')
    const listener = vi.fn()
    const off = fixture.module.subscribeSource(listener)
    const reload = fixture.handlers.get('vite:beforeFullReload')!
    reload({ path: '/__sandbox.html' })
    expect(listener).not.toHaveBeenCalled()
    fixture.handlers.get('histoire:local:catalog')!({ revision: 'next' })
    expect(listener).toHaveBeenLastCalledWith({ revision: 'next' })
    reload({ path: '/index.html' })
    expect(listener).toHaveBeenLastCalledWith(null)
    reload({ path: '*' })
    expect(listener).toHaveBeenCalledTimes(3)
    off()
    expect(fixture.handlers.size).toBe(0)
    const index = await bootstrap('serve', '/book/')
    const current = vi.fn()
    index.module.subscribeSource(current)
    index.handlers.get('vite:beforeFullReload')!({ path: '/__embed.html' })
    expect(current).not.toHaveBeenCalled()
    index.handlers.get('vite:beforeFullReload')!({ path: '/index.html' })
    expect(current).toHaveBeenCalledOnce()
  })
})
