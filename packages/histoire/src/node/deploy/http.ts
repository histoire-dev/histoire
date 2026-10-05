import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PreviewHostRegistry } from '../mcp/browser/preview-host.js'
import type { createMcpHttpHandler } from '../mcp/transport/http.js'
import type { NodeArtifact } from './artifact-reader.js'
import { mergeEmbedFrameAncestors } from '@histoire/protocol'
import { serveNodeHealth } from './health.js'
import { isBookNavigation, publicRequestPath } from './routes.js'
import { serveArtifactAsset } from './static-files.js'

/** Exact route composition shared by production listener tests and generated server. */
export function createNodeHttpHandler(options: { artifact: NodeArtifact, host: PreviewHostRegistry, ready: () => boolean, mcp: () => ReturnType<typeof createMcpHttpHandler> | undefined, embedOrigins?: readonly string[] }) {
  const manifest = options.artifact.manifest
  const prefix = `${manifest.base}__histoire/`
  const mcpPath = `${prefix}mcp`
  let activeAssets = 0
  /** Constant failures never echo paths, tokens or malformed caller input. */
  function failure(response: ServerResponse, status: number) {
    response.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(status === 404 ? 'Not found' : 'Service unavailable')
  }
  return async (request: IncomingMessage, response: ServerResponse) => {
    const raw = request.url ?? ''
    if (options.embedOrigins && raw.startsWith(manifest.base)) {
      const existing = response.getHeader('content-security-policy')
      response.setHeader('content-security-policy', mergeEmbedFrameAncestors(typeof existing === 'number' ? String(existing) : existing, options.embedOrigins))
    }
    if (raw === mcpPath && options.mcp()) return options.mcp()!.handle(request, response)
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      failure(response, 404)
      return
    }
    if (raw === `${prefix}health` || raw === `${prefix}ready`) {
      serveNodeHealth(response, options.ready(), manifest.buildId, raw.endsWith('/ready'))
      return
    }
    if (raw.startsWith(options.host.prefix)) {
      const document = options.host.render(raw)
      if (!document) {
        failure(response, 404)
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      response.end(request.method === 'HEAD' ? undefined : document)
      return
    }
    const path = publicRequestPath(raw, manifest.base)
    if (path === undefined) {
      failure(response, 404)
      return
    }
    if (!options.ready() || activeAssets >= 16) {
      failure(response, 503)
      return
    }
    if (options.embedOrigins && path === 'histoire-embed-origins.json') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ version: 1, allowedOrigins: options.embedOrigins }))
      return
    }
    activeAssets++
    try {
      const file = path || 'index.html'
      if (await serveArtifactAsset(options.artifact, file, response, request.method === 'HEAD')) return
      if (manifest.routerMode === 'history' && isBookNavigation(path, request.headers.accept) && await serveArtifactAsset(options.artifact, 'index.html', response, request.method === 'HEAD')) return
      failure(response, 404)
    }
    catch {
      if (!response.headersSent) failure(response, 503)
      else response.destroy()
    }
    finally { activeAssets-- }
  }
}
