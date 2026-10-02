import type { Connect, ViteDevServer } from 'vite'
import type { PreviewHostRegistry } from '../mcp/browser/preview-host.js'
import { createPreviewHostRegistry } from '../mcp/browser/preview-host.js'

/** Inactive registries add no route until an execution owns a nonce. */
const registries = new WeakMap<ViteDevServer['middlewares'], PreviewHostRegistry>()

/** Resolve the operation host installed ahead of sandbox/history middleware. */
export function getDevPreviewHost(server: ViteDevServer): PreviewHostRegistry {
  // Vite may return a proxy while configureServer receives its backing object.
  // The Connect stack remains the same ownership identity across that wrapper.
  const registry = registries.get(server.middlewares)
  if (!registry) throw new Error('Histoire preview host is not installed')
  return registry
}

/** Thin adapter: transport-neutral HTML stays usable by standalone Node mode. */
export function createMcpPreviewHtmlMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  const registry = createPreviewHostRegistry({ base: server.config.base })
  registries.set(server.middlewares, registry)
  server.httpServer?.once('close', () => registry.close())
  return (request, response, next) => {
    if (!request.url?.startsWith(registry.prefix)) return next()
    const html = request.method === 'GET' ? registry.render(request.url) : undefined
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.setHeader('x-content-type-options', 'nosniff')
    response.statusCode = html ? 200 : 404
    response.end(html ?? 'Preview unavailable')
  }
}
