import type { Socket } from 'node:net'
import type { HttpServer } from 'vite'
import { Server as HttpServerClass } from 'node:http'
import { Server as HttpsServerClass } from 'node:https'
import { HistoireSdkError } from '@histoire/protocol'
import { withCleanupDeadline } from '../cleanup.js'

/** Only listenOwnedServer creates this ownership record; caller servers never enter it. */
const ownedSockets = new WeakMap<HttpServer, { sockets: Set<Socket>, track: (socket: Socket) => void }>()

/** Rejects unsupported HTTP/2 and arbitrary listener-like objects before acquisition. */
export function assertHostingServer(server: HttpServer): void {
  if (!(server instanceof HttpServerClass) && !(server instanceof HttpsServerClass)) throw new HistoireSdkError('INVALID_ARGUMENT', 'httpServer must be an HTTP/1 HTTP or HTTPS server')
}

/** Joins caller listening without ever initiating or closing the listener. */
export function waitForHostingListener(server: HttpServer, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason)
  if (server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    /** Removes only this pending readiness observer. */
    function clean() {
      server.off('listening', listened)
      server.off('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    /** Resolves after caller begins accepting requests. */
    function listened() {
      clean()
      resolve()
    }
    /** Preserves native caller listener failure. */
    function failed(error: Error) {
      clean()
      reject(error)
    }
    /** Terminal SDK close ends waiting without closing caller server. */
    function aborted() {
      clean()
      reject(signal.reason)
    }
    server.once('listening', listened)
    server.once('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Binds an owned listener and reads the actual address, including ephemeral ports. */
export async function listenOwnedServer(server: HttpServer, port: number, host?: string | boolean, strictPort = true): Promise<string> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new HistoireSdkError('INVALID_ARGUMENT', 'port must be an integer from 0 to 65535')
  if (!ownedSockets.has(server)) {
    const sockets = new Set<Socket>()
    const track = (socket: Socket) => {
      sockets.add(socket)
      socket.once('close', () => {
        sockets.delete(socket)
      })
    }
    ownedSockets.set(server, { sockets, track })
    server.on('connection', track)
  }
  let requestedPort = port
  while (!server.listening) {
    try {
      await new Promise<void>((resolve, reject) => {
        function error(value: Error) {
          server.off('listening', listening)
          reject(value)
        }
        function listening() {
          server.off('error', error)
          resolve()
        }
        server.once('error', error)
        server.once('listening', listening)
        server.listen(requestedPort, typeof host === 'string' ? host : host === true ? undefined : 'localhost')
      })
    }
    catch (error) {
      if (strictPort || requestedPort >= 65535 || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      requestedPort++
    }
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to resolve bound Histoire address')
  const hostname = address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address
  return `http://${hostname.includes(':') ? `[${hostname}]` : hostname}:${address.port}`
}

/** Closes only an owned HTTP listener; existing idle sockets cannot stall teardown. */
export async function closeOwnedServer(server: HttpServer): Promise<void> {
  const owned = ownedSockets.get(server)
  const closing = server.listening ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve()
  // Node's closeAllConnections excludes upgraded sockets. An owned listener
  // tracks connection identity so unknown upgrades cannot stall its teardown.
  for (const socket of owned?.sockets ?? []) socket.destroy()
  if (owned) {
    server.off('connection', owned.track)
    ownedSockets.delete(server)
  }
  await withCleanupDeadline(closing)
}
