/** Resolve exact route identity, preferring normal path over dot-ID query fallback. */
export function resolveStoryRouteId(params: { storyId?: unknown }, query: { storyId?: unknown }): string | undefined {
  if (typeof params.storyId === 'string' && params.storyId) return params.storyId
  return typeof query.storyId === 'string' && /^\.+$/.test(query.storyId) ? query.storyId : undefined
}
/** Named story route supports safe query selection for dot-only identities. */
export const STORY_ROUTE_PATH = '/story/:storyId?'
