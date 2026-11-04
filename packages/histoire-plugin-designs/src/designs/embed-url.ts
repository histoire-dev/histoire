import type { EmbedDesignType } from '../types.js'

/** Figma document kinds that have an embeddable counterpart on `embed.figma.com`. */
const FIGMA_KINDS = new Set(['design', 'file', 'proto', 'board', 'slides'])

/**
 * Figma Embed Kit 2.0: the same path served from `embed.figma.com`, identified by `embed-host`.
 * Other `figma.com` pages (community, sites, file browser) refuse framing and have no embed
 * counterpart, so they cannot be embedded.
 * @param url Figma link.
 * @param embedHost Value of `embed-host`; an existing one is kept.
 */
function figmaEmbedUrl(url: URL, embedHost: string): string | undefined {
  const result = new URL(url)
  const kind = url.pathname.split('/')[1]
  if (/(?:^|\.)figma\.com$/.test(url.hostname) && url.hostname !== 'embed.figma.com') {
    if (!FIGMA_KINDS.has(kind)) return
    result.hostname = 'embed.figma.com'
  }
  if (result.hostname === 'embed.figma.com' && !result.searchParams.has('embed-host')) {
    result.searchParams.set('embed-host', embedHost)
  }
  return result.href
}

/**
 * Sketch share links (`/s/<id>`) are embedded from `/embed/s/<id>`.
 * @param url Sketch link.
 */
function sketchEmbedUrl(url: URL): string {
  const result = new URL(url)
  if (/(?:^|\.)sketch\.com$/.test(url.hostname) && url.pathname.startsWith('/s/')) {
    result.pathname = `/embed${url.pathname}`
  }
  return result.href
}

/**
 * URL loaded in the iframe of an embedded design, or `undefined` for a Figma page that cannot
 * be embedded. Penpot view links and plain iframes embed as they are.
 * @param type Embedded design type.
 * @param url Validated design link.
 * @param embedHost Figma `embed-host` value.
 */
export function toEmbedUrl(type: EmbedDesignType, url: URL, embedHost: string): string | undefined {
  if (type === 'figma') return figmaEmbedUrl(url, embedHost)
  if (type === 'sketch') return sketchEmbedUrl(url)
  return url.href
}
