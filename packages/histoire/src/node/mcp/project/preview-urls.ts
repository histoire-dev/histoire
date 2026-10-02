import { getSandboxRelativeUrl, normalizePreviewBase } from '@histoire/shared'
import { McpDomainError } from '../protocol/errors.js'
import { encodeMcpUriSegment } from '../protocol/uris.js'

/** Public URL inputs use trusted server configuration, never caller URLs. */
export interface PreviewUrlOptions {
  /** Actual listened UI origin or configured production public origin. */
  origin: string
  /** Browser deployment base. */
  base: string
  /** Actual UI router mode. */
  routerMode: 'hash' | 'history'
  /** Exact collected story identity. */
  storyId: string
  /** Exact scoped variant identity. */
  variantId: string
}

/** Return UI and sandbox addresses without credentials or browser readiness claims. */
export function createPreviewUrls(options: PreviewUrlOptions) {
  const origin = new URL(options.origin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new McpDomainError('PREVIEW_NOT_READY', 'Preview origin is unavailable', true)
  }
  let base: string
  try {
    base = normalizePreviewBase(options.base)
  }
  catch {
    throw new McpDomainError('PREVIEW_NOT_READY', 'Preview base must be a same-origin absolute path', true)
  }
  const storyUrl = new URL(base, origin.origin)
  const query = new URLSearchParams({ variantId: options.variantId })
  const storyPath = `story/${encodeMcpUriSegment(options.storyId)}`
  if (options.routerMode === 'hash') {
    storyUrl.hash = `/${storyPath}?${query}`
  }
  else if (/^\.+$/.test(options.storyId)) {
    // URL parsing normalizes even percent-encoded dot-only path segments.
    // The UI's query route preserves these identities without path parsing.
    storyUrl.pathname += 'story'
    query.set('storyId', options.storyId)
    storyUrl.search = query.toString()
  }
  else {
    storyUrl.pathname += storyPath
    storyUrl.search = query.toString()
  }
  return {
    storyUrl: storyUrl.href,
    sandboxUrl: new URL(getSandboxRelativeUrl(options), origin.origin).href,
  }
}
