import { expect, it, vi } from 'vitest'
import { isolateSvelteKit } from '../../../../histoire-plugin-svelte/src/util/kit.js'

it('retains Kit configuration and virtual modules while removing application middleware', () => {
  const kit = {
    name: 'vite-plugin-sveltekit-setup',
    config: vi.fn(),
    resolveId: vi.fn(),
    configureServer: vi.fn(),
    configurePreviewServer: vi.fn(),
  }
  const other = { name: 'user-plugin', configureServer: vi.fn() }
  const serverHook = other.configureServer
  expect(isolateSvelteKit().config.handler({}, { command: 'serve' })).toEqual({ appType: 'spa' })
  expect(isolateSvelteKit().config.handler({}, { command: 'build' })).toEqual({ appType: 'spa', define: { __SVELTEKIT_PAYLOAD__: '{}' } })
  isolateSvelteKit().configResolved({ plugins: [kit, other] })
  expect(kit.configureServer).toBeUndefined()
  expect(kit.configurePreviewServer).toBeUndefined()
  expect(kit.config).toBeTypeOf('function')
  expect(kit.resolveId).toBeTypeOf('function')
  expect(other.configureServer).toBe(serverHook)
})
