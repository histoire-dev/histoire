import type { IncomingHttpHeaders } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'node:http'

/** Mutable HTTP responses let tests simulate registry failures without replacing clients. */
export interface RegistryFixtureOptions {
  /** Package names returned in search order. */ names?: string[]
  /** Raw packuments keyed by npm package name. */ packages?: Record<string, unknown>
  /** Maximum results per fixture search page. */ pageSize?: number
  /** Response delay, including headers. */ delayMs?: number
  /** HTTP status for every response. */ status?: number
  /** Raw response override for malformed/oversized body checks. */ body?: string
  /** Registry mount path, including leading and trailing slashes. */ basePath?: string
  /** Reject requests without this exact authorization header. */ authorization?: string
  /** Redirect target for credential forwarding checks. */ redirect?: string
}

/** Start an npm-shaped local registry; caller owns closing it. */
export async function registryServer(options: RegistryFixtureOptions = {}) {
  const requests: URL[] = []
  const headers: IncomingHttpHeaders[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    requests.push(url)
    headers.push({ ...request.headers })
    /** Write only while the requesting client remains connected. */
    const reply = () => {
      if (response.destroyed) return
      if (options.authorization && request.headers.authorization !== options.authorization) {
        response.writeHead(401)
        return response.end('Authentication required')
      }
      if (options.redirect) {
        response.writeHead(302, { location: options.redirect })
        return response.end()
      }
      response.writeHead(options.status ?? 200, { 'content-type': 'application/json' })
      if (options.body !== undefined) return response.end(options.body)
      const pathname = url.pathname.slice((options.basePath ?? '/').length)
      if (pathname === '-/v1/search') {
        const names = options.names ?? Object.keys(options.packages ?? {})
        const from = Number(url.searchParams.get('from') ?? 0)
        const size = Math.min(Number(url.searchParams.get('size') ?? 250), options.pageSize ?? 250)
        response.end(JSON.stringify({ objects: names.slice(from, from + size).map(name => ({ package: { name } })), total: names.length }))
      }
      else {
        response.end(JSON.stringify(options.packages?.[decodeURIComponent(pathname)] ?? {}))
      }
    }
    if (options.delayMs) {
      const timer = setTimeout(reply, options.delayMs)
      response.once('close', () => clearTimeout(timer))
    }
    else { reply() }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing registry address')
  return { url: `http://127.0.0.1:${address.port}`, requests, headers, options,
    /** Release active and idle sockets, including timeout fixtures. */
    close: async () => {
      server.closeAllConnections()
      server.close()
      await once(server, 'close')
    } }
}
