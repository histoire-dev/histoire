import type { HistoireCatalogStory } from '@histoire/protocol'
import type { DesignIssue, EmbedDesignType, ResolvedDesign } from '../types.js'
import { toEmbedUrl } from './embed-url.js'

/** Settings of design resolution. */
export interface ResolveOptions {
  /** Figma `embed-host` value. */
  embedHost: string
  /** Absolute URL of the book base; relative image paths resolve against it. */
  baseUrl: string
}

/** Designs of one variant plus entries that cannot be shown. */
export interface ResolvedDesigns {
  /** Valid designs in declaration order. */
  designs: ResolvedDesign[]
  /** Invalid entries. */
  issues: DesignIssue[]
  /** Why the story could not be loaded; both lists are empty then. */
  error?: string
}

/** Switcher label of each design tool. */
const TOOL_NAMES: Record<string, string> = { figma: 'Figma', penpot: 'Penpot', sketch: 'Sketch', image: 'Image' }
/** Types rendered in an iframe; checked at runtime since `meta.design` is untyped user data. */
const EMBED_TYPES = new Set<string>(['figma', 'penpot', 'sketch', 'iframe'])

/** Issue reported for `figma.com` pages without an embeddable counterpart. */
const FIGMA_NOT_EMBEDDABLE = 'This Figma link cannot be embedded; use a design, prototype, board or slides link'

/**
 * Raw `meta.design` of a variant: its own list replaces the story's.
 * @param story Catalog story.
 * @param variantId Variant id.
 */
function designMeta(story: HistoireCatalogStory, variantId: string): unknown {
  const variant = story.variants.find(item => item.id === variantId)
  return variant?.meta?.design ?? story.meta?.design
}

/**
 * Parses a design link. Only `http(s)` links are accepted; paths (images only) resolve
 * against the book base, `/x` included, so books served under a sub-path keep working.
 * @param value Raw URL.
 * @param baseUrl Book base URL.
 * @param allowPath Accept paths relative to the book.
 */
function parseUrl(value: unknown, baseUrl: string, allowPath: boolean): URL | string {
  if (typeof value !== 'string' || !value.trim()) return 'Missing url'
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')
  if (!absolute && !allowPath) return 'Expected an http(s) url'
  let url: URL
  try {
    url = absolute ? new URL(value, baseUrl) : new URL(value.replace(/^\/+/, ''), baseUrl)
  }
  catch {
    return 'Invalid url'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Expected an http(s) url'
  // Credentials would leak into iframes, links and the switcher; never send them.
  if (url.username || url.password) return 'Links with credentials are not allowed'
  return url
}

/**
 * Validates one entry of `meta.design`.
 * @param entry Raw entry.
 * @param index Position in the list.
 * @param options Resolution settings.
 */
function resolveEntry(entry: unknown, index: number, options: ResolveOptions): ResolvedDesign | string {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'Expected an object with type and url'
  const input = entry as Record<string, unknown>
  const type = input.type
  if (typeof type !== 'string' || (!EMBED_TYPES.has(type) && type !== 'image' && type !== 'link')) return `Unknown type ${JSON.stringify(type)}`
  const url = parseUrl(input.url, options.baseUrl, type === 'image')
  if (typeof url === 'string') return url
  const label = typeof input.label === 'string' && input.label ? input.label : undefined
  // Name fallbacks: explicit `name`, then a link's `label`, then the tool name (Figma, Image...),
  // then the host name for plain iframes and links.
  const name = typeof input.name === 'string' && input.name ? input.name : (type === 'link' ? label : undefined) ?? TOOL_NAMES[type] ?? url.hostname
  const base = { index, name, externalUrl: url.href }
  if (type === 'link') return { ...base, type, label: label ?? name }
  if (type === 'image') {
    const scale = input.scale
    if (scale !== undefined && (typeof scale !== 'number' || !(scale > 0) || !Number.isFinite(scale))) return 'scale must be a number greater than 0'
    const offset = input.offset
    // `offset` must be a tuple of two finite numbers (no NaN or Infinity from computed values).
    if (offset !== undefined && (!Array.isArray(offset) || offset.length !== 2 || offset.some(value => typeof value !== 'number' || !Number.isFinite(value)))) return 'offset must be [x, y]'
    return { ...base, type, src: url.href, alt: typeof input.alt === 'string' ? input.alt : name, ...(scale === undefined ? {} : { scale }), ...(offset ? { offset: [offset[0], offset[1]] as [number, number] } : {}) }
  }
  const src = toEmbedUrl(type as EmbedDesignType, url, options.embedHost)
  if (!src) return FIGMA_NOT_EMBEDDABLE
  return { ...base, type: type as EmbedDesignType, src, allowFullscreen: input.allowFullscreen === true }
}

/**
 * User-facing line of an invalid entry, shared by the inspector tab and canvas view.
 * @param issue Invalid entry.
 */
export function formatIssue(issue: DesignIssue): string {
  return `Entry ${issue.index + 1}: ${issue.message}`
}

/**
 * Designs declared for one variant through `meta.design` (single entry or list).
 * @param story Catalog story.
 * @param variantId Variant id.
 * @param options Resolution settings.
 */
export function resolveDesigns(story: HistoireCatalogStory, variantId: string, options: ResolveOptions): ResolvedDesigns {
  const meta = designMeta(story, variantId)
  const result: ResolvedDesigns = { designs: [], issues: [] }
  if (meta === undefined || meta === null) return result
  const entries = Array.isArray(meta) ? meta : [meta]
  entries.forEach((entry, index) => {
    const design = resolveEntry(entry, index, options)
    if (typeof design === 'string') result.issues.push({ index, message: design })
    else result.designs.push(design)
  })
  return result
}
