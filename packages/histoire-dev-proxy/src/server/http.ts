import type { PublicState } from '../protocol.js'
import type { ProxyRequestObserver, RequestObservation } from './observe.js'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { renderLoadingPage } from '../client/page.js'
import { designPlaygroundPath, renderDesignPlayground } from '../client/playground.js'
import { createStatusChannel } from './events.js'
import { observeRequest } from './observe.js'

/** Proxy-owned responses expose startup errors; reject DNS-rebinding hosts like Vite's default allowedHosts. */
function isTrustedHost(host: string | undefined) {
  if (!host) return false
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '')
  return hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname) !== 0
}

/** Stable HTTP listener delegates only after coherent generation readiness. */
export function createProxyHttp(read: () => PublicState, restart: () => Promise<void>, observer?: ProxyRequestObserver) {
  /** Exchange counter; only used when an observer exists. */
  let exchanges = 0
  let target: string | undefined
  let proxy: Awaited<ReturnType<typeof import('httpxy')['createProxyServer']>> | undefined
  const sockets = new Set<import('node:net').Socket>()
  const upgraded = new Set<import('node:stream').Duplex>()
  const events = createStatusChannel(read)
  const assets = new Map<string, Promise<string>>()
  const server = createServer(async (request, response) => {
    const pathname = (request.url ?? '/').split('?')[0]
    // Registered before any dispatch. Proxy-owned routes (status stream, loading assets, restart) are not traffic of the project.
    const observation: RequestObservation | undefined = observer && !pathname.startsWith('/__histoire/dev/') ? observeRequest(request, response, ++exchanges, observer) : undefined
    try {
      // Proxied runtime requests keep Vite's own host policy; everything answered here is checked.
      if (!(target && proxy && !pathname.startsWith('/__histoire/dev/')) && !isTrustedHost(request.headers.host)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        response.end('Blocked host')
        return
      }
      if (pathname === '/__histoire/dev/restart' && request.method === 'POST') {
        // Cross-site pages can send simple POSTs without reading responses; only accept own origin.
        if (request.headers.origin !== `http://${request.headers.host}`) {
          response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Cross-origin restart refused')
          return
        }
        // Outcome reaches the page over the status stream.
        void restart().catch(() => {})
        response.writeHead(202, { 'cache-control': 'no-store' }).end()
        return
      }
      if (pathname === '/__histoire/dev/events' && request.method === 'GET') return events.connect(request, response)
      if (pathname === designPlaygroundPath && ['GET', 'HEAD'].includes(request.method ?? '')) {
        const query = new URL(request.url ?? '/', 'http://localhost').searchParams
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
        response.end(request.method === 'HEAD' ? undefined : renderDesignPlayground(query, read()))
        return
      }
      if (pathname.startsWith('/__histoire/dev/')) {
        const name = pathname.slice('/__histoire/dev/'.length)
        // Entries share code through bundler chunks, which must be served next to them.
        if (/^(?:lifecycle|demo|chunks\/[\w-]+)\.js$/.test(name) && ['GET', 'HEAD'].includes(request.method ?? '')) {
          if (!assets.has(name)) assets.set(name, readFile(new URL(`../browser/${name}`, import.meta.url), 'utf8'))
          const asset = await assets.get(name)
          response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
          response.end(request.method === 'HEAD' ? undefined : asset)
          return
        }
        response.writeHead(404).end('Not found')
        return
      }
      if (target && proxy) {
        await proxy.web(request, response, { target })
        return
      }
      const document = request.headers.accept?.includes('text/html') || request.headers['sec-fetch-dest'] === 'document'
      // Fetch defaults to */* for extensionless APIs too. Only root has a
      // document fallback; all other routes require explicit navigation intent.
      const html = ['GET', 'HEAD'].includes(request.method ?? '') && (document || (pathname === '/' && !request.headers.accept?.includes('application/json')))
      response.writeHead(html ? 200 : 503, { 'content-type': html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      response.end(request.method === 'HEAD' ? undefined : html ? renderLoadingPage(read()) : 'Histoire runtime unavailable')
    }
    catch {
      // Appending text to a partially proxied body would corrupt it; abort instead.
      if (response.headersSent) {
        observation?.fail()
        response.destroy()
        return
      }
      response.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
      response.end('Histoire runtime unavailable')
    }
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (request, socket, head) => {
    if (!target || !proxy) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      return
    }
    upgraded.add(socket)
    socket.once('close', () => upgraded.delete(socket))
    void proxy.ws(request, socket as never, { target }, head).catch(() => socket.destroy())
  })
  return {
    server,
    events,
    /** Forwarding library is deliberately absent from initial listener import graph. */
    async prepare() {
      proxy = (await import('httpxy')).createProxyServer({ xfwd: true, ws: true })
    },
    /** Withdraw target synchronously and retire old runtime WebSockets. */
    setTarget(next?: string) {
      target = next
      if (!next) {
        for (const socket of upgraded) socket.destroy()
        upgraded.clear()
      }
    },
    /** Release the bound address while keeping the server reusable for another bind. */
    async unlisten() {
      if (!server.listening) return
      const closing = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      for (const socket of sockets) socket.destroy()
      await closing
    },
    /** Join listener close after terminating owned streams and idle connections. */
    async close() {
      target = undefined
      events.close()
      const closing = server.listening ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve()
      for (const socket of sockets) socket.destroy()
      await closing
    },
  }
}
