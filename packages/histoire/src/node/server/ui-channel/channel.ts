import type { ViteDevServer } from 'vite'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { assertUiPayload } from './validation.js'

/** Create bounded custom events without importing any development feature. */
export function createUiChannel(server: ViteDevServer, isActive: () => boolean): UiChannelServer {
  const listeners = new Set<() => void>()
  const cleanups: (() => void | Promise<void>)[] = []
  const ready = new Set<(client: UiChannelClient) => void | Promise<void>>()
  let closed = false
  let closing: Promise<void> | undefined
  /** Only this namespace may be registered on the UI channel. */
  function checkEvent(event: string) {
    if (!event.startsWith('histoire:ui:')) throw new Error('Invalid UI channel event')
  }
  const channel: UiChannelServer = {
    on(event, validate, handler) {
      checkEvent(event)
      /** Untrusted client callbacks never leak rejection to Vite's event loop. */
      const receive = async (value: unknown, client: UiChannelClient) => {
        if (closed || !isActive()) return
        try {
          assertUiPayload(value)
          await handler(validate(value), client)
        }
        catch { /* Feature handlers reply deliberately; invalid envelopes are rejected. */ }
      }
      server.ws.on(event, receive)
      /** Detach exactly this feature's listener. */
      const off = () => {
        server.ws.off(event, receive)
        listeners.delete(off)
      }
      listeners.add(off)
      return off
    },
    send(event, data, client) {
      if (closed || !isActive()) return
      checkEvent(event)
      assertUiPayload(data)
      if (client) client.send(event, data)
      else server.ws.send(event, data)
    },
    onReady(callback) {
      ready.add(callback)
      return () => ready.delete(callback)
    },
    addCleanup(callback) { cleanups.push(callback) },
    close() {
      closed = true
      for (const off of [...listeners]) off()
      ready.clear()
      return closing ??= (async () => {
        const results = await Promise.allSettled(cleanups.reverse().map(callback => Promise.resolve().then(callback)))
        const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
        if (failures.length) throw new AggregateError(failures, 'UI channel cleanup failed')
      })()
    },
  }
  channel.on('histoire:ui:ready', (value) => {
    if (!value || typeof value !== 'object' || Object.keys(value).length) throw new Error('Invalid ready request')
    return value
  }, (_, client) => {
    for (const callback of ready) {
      try {
        void Promise.resolve(callback(client)).catch(() => {})
      }
      catch { /* One unavailable feature cannot suppress other initial snapshots. */ }
    }
  })
  return channel
}
