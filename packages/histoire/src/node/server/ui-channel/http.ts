import type { Connect, ViteDevServer } from 'vite'

/** Registered late, dispatched by middleware acquired before Vite's SPA fallback. */
interface UiHttpRoute {
  /** Prefix owned by this feature. */
  prefix: string
  /** Exact captured generation ownership. */
  isActive: () => boolean
  /** Feature keeps its existing method, origin, and payload validation. */
  handler: Connect.NextHandleFunction
}

/** Vite proxies share the public Connect stack identity used by configureServer. */
const routers = new WeakMap<ViteDevServer['middlewares'], Set<UiHttpRoute>>()

/** Resolve internal route against actual Vite base, including middleware hosting. */
export function uiHttpPath(server: Pick<ViteDevServer, 'config'>, path: string): string {
  return `${server.config.base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

/** Own reserved UI HTTP paths before the public Vite middleware stack is finalized. */
export function installUiHttpRouter(server: ViteDevServer): void {
  if (routers.has(server.middlewares)) return
  const routes = new Set<UiHttpRoute>()
  routers.set(server.middlewares, routes)
  const namespaces = ['screenshots', 'agents'].map(name => uiHttpPath(server, `/__histoire/${name}`))
  server.httpServer?.once('close', () => routes.clear())
  server.middlewares.use((request, response, next) => {
    const path = request.url?.split('?')[0]
    if (!path || !namespaces.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return next()
    const route = [...routes].find(route => request.url!.startsWith(route.prefix))
    /** Reserved, unavailable, or failed routes cannot fall through to app HTML. */
    function unavailable(error?: unknown): void {
      if (response.writableEnded) return
      if (response.headersSent) {
        response.destroy()
        return
      }
      response.statusCode = error ? 500 : 404
      response.setHeader('content-type', 'text/plain')
      response.setHeader('cache-control', 'no-store')
      response.setHeader('x-content-type-options', 'nosniff')
      response.end(error ? 'UI request failed' : 'UI route unavailable')
    }
    try {
      if (!route?.isActive()) return unavailable()
      void Promise.resolve(route.handler(request, response, unavailable)).catch(unavailable)
    }
    catch { unavailable(new Error('UI handler unavailable')) }
  })
}

/** Attach one generation-owned feature to the already installed public HTTP boundary. */
export function registerUiHttpRoute(server: ViteDevServer, prefix: string, handler: Connect.NextHandleFunction, isActive: () => boolean): () => void {
  const routes = routers.get(server.middlewares)
  if (!routes) throw new Error('UI HTTP router must be installed during configureServer')
  const owned = ['screenshots', 'agents'].some(name => prefix.startsWith(uiHttpPath(server, `/__histoire/${name}/`)))
  if (!owned) throw new Error('Invalid UI HTTP route prefix')
  if ([...routes].some(route => route.prefix === prefix)) throw new Error('UI HTTP route already registered')
  const route = { prefix, handler, isActive }
  routes.add(route)
  return () => routes.delete(route)
}
