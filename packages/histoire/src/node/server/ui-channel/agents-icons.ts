import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { AcpManager } from '../../acp/manager.js'
import type { Context } from '../../context.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'

/**
 * Serves cached registry agent logos at `/__histoire/agents/icon/<registryId>`.
 * Only registry-owned URLs are fetched; the browser never supplies one. Responses
 * forbid every subresource and script so a hostile SVG stays inert even if opened directly.
 */
export function registerAgentIcons(ctx: Context, server: ViteDevServer, manager: Pick<AcpManager, 'icon'>, isActive: () => boolean): () => void {
  const prefix = uiHttpPath(server, '/__histoire/agents/icon/')
  return registerUiHttpRoute(server, prefix, (request: IncomingMessage, response: ServerResponse, next) => {
    const path = request.url?.split('?')[0] ?? ''
    if (!path.startsWith(prefix)) return next()
    response.setHeader('X-Content-Type-Options', 'nosniff')
    /** Plain 404 for unknown agents, missing or unusable logos. */
    function missing(): void {
      response.statusCode = 404
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/plain')
      response.end('Agent icon unavailable')
    }
    let id = ''
    try {
      id = decodeURIComponent(path.slice(prefix.length))
    }
    catch { /* Malformed escapes are refused below. */ }
    if (ctx.mode !== 'dev' || !isActive() || request.method !== 'GET' || !/^[\w-]{1,80}$/.test(id)) return missing()
    void manager.icon(id).then((svg) => {
      if (!svg || !isActive()) return missing()
      response.setHeader('Content-Type', 'image/svg+xml')
      response.setHeader('Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox')
      response.setHeader('Cache-Control', 'private, max-age=86400')
      response.end(svg)
    }, missing)
  }, isActive)
}
