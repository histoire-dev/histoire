import type { ServerResponse } from 'node:http'
import type { Connect, ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import { HistoireSdkError, mergeEmbedFrameAncestors } from '@histoire/protocol'
import { APP_PATH } from '../../alias.js'
import { resolveEmbedConfig } from '../../config/embed.js'
import { getRuntimeCatalogForContext } from '../../runtime/catalog/attachment.js'
import { CatalogError } from '../../runtime/catalog/types.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { applyDevResponseHeaders } from '../../vite/dev-html.js'
import { projectEmbedContent } from './content.js'
import { resolveEmbedEditorTarget } from './editor.js'
import { readEmbedActionInput } from './request.js'
import { createEmbedSource } from './source.js'
import { runEmbedServerTests } from './tests.js'

/** Writes portable JSON or typed source failures without leaking Node stack/path details. */
function sendJson(res: ServerResponse, value: unknown, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=UTF-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

/** Dev routes bind same completed source used by SDK/MCP; disabled route never falls through. */
export function createEmbedMiddleware(server: ViteDevServer, ctx: Context): Connect.NextHandleFunction {
  const config = resolveEmbedConfig(ctx.config.embed)
  const sources = new Map<'embed' | 'local', ReturnType<typeof createEmbedSource>>()
  /** Acquires existing generation attachment, never creates another reader/collector. */
  async function readySource(namespace: 'embed' | 'local') {
    const attachment = getRuntimeCatalogForContext(ctx)
    if (!attachment) throw new CatalogError('PROJECT_STARTING', 'Source catalog is starting', true)
    await attachment.ready
    let source = sources.get(namespace)
    if (!source) {
      source = createEmbedSource(ctx, attachment.catalog, namespace)
      sources.set(namespace, source)
      getContextRegistry(ctx).cleanup.add(source.subscribe(descriptor => server.ws.send({ type: 'custom', event: `histoire:${namespace}:catalog`, data: descriptor })))
    }
    return source
  }
  return async (req, res, next) => {
    const path = req.url?.split('?')[0]
    const base = server.config.base
    if (config.enabled && path?.startsWith(base)) {
      const existing = res.getHeader?.('Content-Security-Policy') ?? server.config.server?.headers?.['Content-Security-Policy'] ?? server.config.server?.headers?.['content-security-policy']
      res.setHeader('Content-Security-Policy', mergeEmbedFrameAncestors(typeof existing === 'number' ? String(existing) : existing, config.allowedOrigins))
    }
    // Local source is first-party standalone data, independent of public
    // embedding authority. Both namespaces share the canonical publication.
    const namespace = path?.startsWith(`${base}__histoire/local/`) || path?.startsWith(`${base}assets/histoire-local-`) ? 'local' : 'embed'
    const embedDocument = path === `${base}__embed.html`
    const descriptor = path === `${base}${namespace === 'local' ? '__histoire/local/descriptor.json' : 'histoire-embed.json'}`
    const tests = path === `${base}__histoire/${namespace}/tests`
    const editor = path === `${base}__histoire/${namespace}/editor`
    const contentPath = path?.startsWith(`${base}assets/histoire-${namespace}-`) ? path.slice(base.length) : undefined
    if (!embedDocument && !descriptor && !contentPath && !tests && !editor) return next()
    applyDevResponseHeaders(server, res)
    if (namespace === 'embed' && !config.enabled) return sendJson(res, { code: 'CAPABILITY_UNAVAILABLE', message: 'Embedding is disabled' }, 404)
    try {
      if (embedDocument) {
        const suffix = process.env.HISTOIRE_DEV ? '-dev' : ''
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module" src="/@fs/${APP_PATH}/bundle-embed${suffix}.js"></script></body></html>`
        const transformed = await server.transformIndexHtml(req.url, html)
        res.setHeader('content-type', 'text/html; charset=UTF-8')
        res.end(transformed)
        return
      }
      const current = await readySource(namespace)
      const value = current.getDescriptor()
      if (editor) {
        const file = resolveEmbedEditorTarget(current.catalog.current!, value, await readEmbedActionInput(req))
        // Vite owns editor launch. Rewrite to its existing middleware with a
        // canonical collected path, before Vite strips configured base prefix.
        req.url = `${base}__open-in-editor?file=${encodeURIComponent(file)}`
        return next()
      }
      if (tests) return sendJson(res, await runEmbedServerTests(ctx, req, res, value))
      if (descriptor) return sendJson(res, value)
      if (contentPath === value.assets.search) return sendJson(res, current.getSearch())
      for (const entry of value.assets.content) {
        if (contentPath === entry.docs) return sendJson(res, projectEmbedContent(await current.getDocs(entry.storyId, value.revision)))
        if (contentPath === entry.rawSource) return sendJson(res, projectEmbedContent(await current.getSource(entry.storyId, value.revision)))
      }
      sendJson(res, { code: 'STALE_REVISION', message: 'Source asset is unavailable at current revision' }, 404)
    }
    catch (error) {
      const code = error instanceof CatalogError || error instanceof HistoireSdkError ? error.code : tests ? 'INTERNAL_ERROR' : 'SOURCE_UNAVAILABLE'
      if (!res.destroyed) sendJson(res, { code, message: error instanceof HistoireSdkError ? error.message : code === 'PROJECT_STARTING' ? 'Source catalog is starting' : 'Source content is unavailable' }, code === 'PROJECT_STARTING' ? 503 : 500)
    }
  }
}
