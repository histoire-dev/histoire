import type { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { HttpServer, ProxyOptions, ServerOptions } from 'vite'
import { EventEmitter } from 'node:events'
import { posix } from 'node:path'
import { matchesHostingBase } from './routes.js'

/** Builds the exact base-aware HMR path used by Vite client and upgrade handler. */
export function createHostingHmr(server: HttpServer, base: string, publicOrigin?: string): ServerOptions['hmr'] {
  const origin = publicOrigin && new URL(publicOrigin)
  return {
    server,
    path: posix.relative(base, getHostingHmrPath(base)),
    ...(origin ? { host: origin.hostname, protocol: origin.protocol === 'https:' ? 'wss' : 'ws', clientPort: Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) } : {}),
  }
}

/** Public path matches Vite's own posix.join(base, hmr.path), never manual doubling. */
export function getHostingHmrPath(base: string): string {
  return posix.join(base, '__histoire/hmr')
}

/** Owns proxy upgrade events without patching or diffing caller server listeners. */
export function createHostingProxyEvents(server: HttpServer, base: string, proxy: Record<string, string | ProxyOptions> = {}) {
  const events = new EventEmitter()
  const sockets = new Set<Duplex>()
  const routes = Object.entries(proxy).filter(([, options]) => (typeof options === 'object' && (options.ws || /^wss?:/.test(String(options.target)))) || (typeof options === 'string' && /^wss?:/.test(options))).map(([route]) => route.startsWith('^') ? new RegExp(route) : route)
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = request.url ?? ''
    if (!matchesHostingBase(url, base) || !routes.some(route => typeof route === 'string' ? url.startsWith(route) : route.test(url))) return
    sockets.add(socket)
    socket.once('close', () => {
      sockets.delete(socket)
    })
    events.emit('upgrade', request, socket, head)
  }
  if (routes.length) server.on('upgrade', upgrade)
  return {
    /** Vite's proxy integration only registers events on this private facade. */
    server: events as unknown as HttpServer,
    /** Removes exact forwarding listener and terminates only claimed proxy sockets. */
    close() {
      server.off('upgrade', upgrade)
      for (const socket of sockets) socket.destroy()
      sockets.clear()
      events.removeAllListeners()
    },
  }
}
