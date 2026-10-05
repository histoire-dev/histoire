/** Resolve exact route identity, preferring normal path over dot-ID query fallback. */
export function resolveStoryRouteId(params: { storyId?: unknown }, query: { storyId?: unknown }): string | undefined {
  if (typeof params.storyId === 'string' && params.storyId) return params.storyId
  return typeof query.storyId === 'string' && /^\.+$/.test(query.storyId) ? query.storyId : undefined
}

/** Parsed URL query retains bare values and repeated parameters, matching router input semantics. */
export type StoryRouteQuery = Record<string, string | null | readonly (string | null)[]>

/** Decode URL query once without collapsing bare `?variantId` into an empty string. */
export function parseStoryRouteQuery(search: string): StoryRouteQuery {
  const query: StoryRouteQuery = Object.create(null)
  for (const pair of search.replace(/^\?/, '').split('&')) {
    if (!pair) continue
    new URLSearchParams(pair).forEach((decoded, key) => {
      const value = pair.includes('=') ? decoded : null
      const previous = query[key]
      if (previous === undefined) query[key] = value
      else if (previous === null) query[key] = [null, value]
      else if (typeof previous === 'string') query[key] = [previous, value]
      else query[key] = [...previous, value]
    })
  }
  return query
}

/** Resolve shared path/query identity and keep omitted variants distinct from explicit null. */
export function resolveStoryRouteSelection(params: { storyId?: unknown }, query: { storyId?: unknown, variantId?: unknown }): { storyId: string, variantId?: string | null } | undefined {
  const storyId = resolveStoryRouteId(params, query)
  if (!storyId) return
  const variantId = query.variantId
  if (variantId === null) return { storyId, variantId: null }
  return { storyId, ...(typeof variantId === 'string' ? { variantId } : {}) }
}

/** Hash routes support both normal path IDs and dot-only query identities. */
export function isStoryRouteHash(hash: string): boolean {
  return /^#\/story(?:[/?]|$)/.test(hash)
}

/** Named story route supports safe query selection for dot-only identities. */
export const STORY_ROUTE_PATH = '/story/:storyId?'
