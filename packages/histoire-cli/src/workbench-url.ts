import { normalizePreviewBase } from '@histoire/protocol'

/** Inputs of a workbench story route; trusted server configuration plus exact collected identities. */
export interface StoryRouteOptions {
  /** Actual listened UI origin or configured public origin. */
  origin: string
  /** Browser deployment base. */
  base: string
  /** Actual UI router mode. */
  routerMode: 'hash' | 'history'
  /** Exact collected story identity. */
  storyId: string
  /** Exact scoped variant identity; omitted for the story route itself (no variant is invented). */
  variantId?: string
}

/** Why a route could not be built. */
export class StoryRouteError extends Error {
  /** Which input was unusable. */
  readonly reason: 'origin' | 'base'

  /** Creates a failure naming the unusable input. */
  constructor(reason: 'origin' | 'base', message: string) {
    super(message)
    this.name = 'StoryRouteError'
    this.reason = reason
  }
}

/** Encodes an exact ID as one RFC 3986 segment; dot-only segments never undergo URL normalization. */
export function encodeUriSegment(value: string): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return /^\.+$/.test(value) ? encoded.replace(/\./g, '%2E') : encoded
}

/**
 * Builds the workbench URL of a story, or of one of its variants.
 * Transport neutral and dependency free (no MCP, runtime or Vite graph), so the
 * terminal parent and the MCP facade share one implementation.
 * @param options Origin, base, router mode and exact identities.
 * @throws StoryRouteError for a credential-bearing/non-HTTP origin or a base leaving the origin.
 */
export function createStoryUrl(options: StoryRouteOptions): string {
  const origin = new URL(options.origin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new StoryRouteError('origin', 'Origin is unavailable')
  }
  let base: string
  try {
    base = normalizePreviewBase(options.base)
  }
  catch {
    throw new StoryRouteError('base', 'Base must be a same-origin absolute path')
  }
  const storyUrl = new URL(base, origin.origin)
  const query = new URLSearchParams(options.variantId === undefined ? {} : { variantId: options.variantId })
  const storyPath = `story/${encodeUriSegment(options.storyId)}`
  if (options.routerMode === 'hash') {
    storyUrl.hash = `/${storyPath}${query.size ? `?${query}` : ''}`
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
  return storyUrl.href
}
