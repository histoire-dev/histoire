/** Data-only bootstrap virtual module; no catalog/body/story imports. */
export const EMBED_SOURCE_ID = 'virtual:$histoire-embed-source'
/** Vite-owned module identity follows existing Histoire virtual resolution convention. */
export const RESOLVED_EMBED_SOURCE_ID = `/__resolved__${EMBED_SOURCE_ID}`
/** Standalone bootstrap uses the same data reader with first-party-only routes. */
export const LOCAL_SOURCE_ID = 'virtual:$histoire-local-source'
/** Exact virtual identity excludes arbitrary host-provided module loaders. */
export const RESOLVED_LOCAL_SOURCE_ID = `/__resolved__${LOCAL_SOURCE_ID}`

/** Emits source-base reference and owned HMR subscription without runtime loaders. */
export function embedSourceModule(namespace: 'embed' | 'local' = 'embed', command: 'serve' | 'build' = 'serve'): string {
  // Vite's effective base includes caller-owned middleware mounting overrides,
  // which can differ from the project's initially resolved configuration.
  return `export const bookBase = import.meta.env.BASE_URL
${namespace === 'local'
  ? `export async function loadDescriptor() {
  const path = ${JSON.stringify(command === 'serve' ? '__histoire/local/descriptor.json' : 'assets/histoire-local.json')}
  const response = await fetch(new URL(path, new URL(bookBase, location.origin)), { credentials: 'same-origin', cache: 'no-store', redirect: 'error' })
  if (!response.ok) throw new Error('Local source catalog is unavailable')
  return response.json()
}`
  : ''}
export function subscribeSource(listener) {
  if (!import.meta.hot) return () => {}
  const update = value => listener(value)
  const disconnect = payload => {
    // Vite announces every reload before deciding whether this document reloads.
    // A sandbox-only HTML reload must not retire its still-live wrapper/source.
    if (payload.path && payload.path.endsWith('.html')) {
      const pagePath = decodeURI(location.pathname)
      const payloadPath = bookBase + payload.path.slice(1)
      if (pagePath !== payloadPath && payload.path !== '/index.html'
        && !(pagePath.endsWith('/') && pagePath + 'index.html' === payloadPath)) return
    }
    listener(null)
  }
  import.meta.hot.on('histoire:${namespace}:catalog', update)
  import.meta.hot.on('vite:beforeFullReload', disconnect)
  return () => {
    import.meta.hot.off('histoire:${namespace}:catalog', update)
    import.meta.hot.off('vite:beforeFullReload', disconnect)
  }
}`
}
