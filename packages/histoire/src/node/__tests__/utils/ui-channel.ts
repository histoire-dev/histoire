import type { ViteDevServer } from 'vite'
import { vi } from 'vitest'
import { createUiChannel } from '../../server/ui-channel/channel.js'

/** Exercise the actual bounded channel without opening a development socket. */
export function uiChannelFixture(isActive: () => boolean = () => true) {
  const handlers = new Map<string, (value: unknown, client: any) => Promise<void>>()
  const ws = { on: vi.fn((event, callback) => handlers.set(event, callback)), off: vi.fn(event => handlers.delete(event)), send: vi.fn() }
  const client = { send: vi.fn() }
  const server = { ws, config: { base: '/' }, middlewares: { use: vi.fn() }, httpServer: { once: vi.fn() } } as unknown as ViteDevServer
  const channel = createUiChannel(server, isActive)
  return { handlers, ws, client, server, channel,
    /** Drive the same payload validation and generation guard as Vite. */
    request: (event: string, value: unknown) => handlers.get(event)!(value, client) }
}
