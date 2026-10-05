import type { Connect } from 'vite'
import type { PreviewHostRegistry } from '../browser/preview-host.js'
import { HistoireSdkError } from '@histoire/protocol'
import { normalizeNodeBase } from '../../deploy/base.js'

/** Uses the canonical deployment spelling for managed and host-owned routes. */
export function normalizeHostingBase(value: string): string {
  try {
    return normalizeNodeBase(value)
  }
  catch {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'base must be a canonical absolute URL path')
  }
}

/** Accepts explicit HTTP(S) authorities without treating paths as origins. */
export function normalizeHostingOrigin(value: string): string {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Invalid origin')
    return parsed.origin
  }
  catch {
    throw new HistoireSdkError('INVALID_ARGUMENT', 'publicOrigin must be an explicit HTTP(S) origin without credentials, path, query or fragment')
  }
}

/** Claims the exact base root and descendants without consuming adjacent paths. */
export function matchesHostingBase(url: string | undefined, base: string): boolean {
  const pathname = (url ?? '').split('?', 1)[0]
  return pathname.startsWith(base) || (base !== '/' && pathname === base.slice(0, -1))
}

/** Replies explicitly while a claimed runtime has no ready generation. */
export const unavailableMiddleware: Connect.NextHandleFunction = (_request, response) => {
  response.statusCode = 503
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end('Histoire runtime unavailable')
}

/** Serves active capabilities before static/history routes, including expired 404s. */
export function createPreviewRoute(registry: PreviewHostRegistry): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (!request.url?.startsWith(registry.prefix)) return next()
    const html = request.method === 'GET' ? registry.render(request.url) : undefined
    response.statusCode = html ? 200 : 404
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.setHeader('x-content-type-options', 'nosniff')
    response.end(html ?? 'Preview unavailable')
  }
}

/** Exposes the effective Node origin policy to the data child before static fallback. */
export function createEmbedOriginsRoute(base: string, allowedOrigins: readonly string[]): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (request.url?.split('?', 1)[0] !== `${base}histoire-embed-origins.json`) return next()
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'application/json; charset=utf-8')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 404
      response.end('Not found')
      return
    }
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ version: 1, allowedOrigins }))
  }
}
