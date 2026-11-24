import type { ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createDevProxyPlugin } from '../vite/dev-proxy.js'

function createConfig(https?: object) {
  return {
    server: { host: 'localhost', port: 5173, https, hmr: true, ws: true, allowedHosts: [] as string[] },
    logger: { warn: vi.fn() },
  } as unknown as ResolvedConfig
}

function runConfigResolved(config: ResolvedConfig) {
  const plugin = createDevProxyPlugin({ origin: 'http://localhost:6006', generation: 'test' }, false)
  return (plugin.configResolved as (config: ResolvedConfig) => void)(config)
}

describe('dev proxy https policy', () => {
  it('keeps the runtime on HTTP when a plugin enables https after an await', async () => {
    const config = createConfig()
    async function basicSslLike(resolved: ResolvedConfig) {
      await Promise.resolve()
      if (resolved.server.https === undefined || resolved.server.https) resolved.server.https = { cert: 'cert', key: 'key' }
    }
    await Promise.all([basicSslLike(config), runConfigResolved(config)])
    expect(config.server.https).toBeUndefined()
    expect(config.logger.warn).toHaveBeenCalledOnce()
  })

  it('warns once when https is already configured', () => {
    const config = createConfig({ cert: 'cert', key: 'key' })
    runConfigResolved(config)
    config.server.https = { cert: 'other', key: 'other' }
    expect(config.server.https).toBeUndefined()
    expect(config.logger.warn).toHaveBeenCalledOnce()
  })

  it('stays silent without https', () => {
    const config = createConfig()
    runConfigResolved(config)
    expect(config.logger.warn).not.toHaveBeenCalled()
  })
})
