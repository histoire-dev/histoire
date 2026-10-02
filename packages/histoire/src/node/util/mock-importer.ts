import type { ViteDevServer } from 'vite'

/** Map browser stack URLs back to Vite module identity before relative mock resolution. */
export async function resolveMockImporter(server: ViteDevServer, importer?: string): Promise<string | undefined> {
  if (!importer) return importer
  if (importer.startsWith(`${server.config.root}/`)) return importer
  let path = importer
  if (/^https?:\/\//.test(path)) {
    const url = new URL(path)
    path = `${url.pathname}${url.search}`
  }
  const base = server.config.base ?? '/'
  if (base !== '/' && path.startsWith(base)) path = `/${path.slice(base.length)}`
  // Loaded browser modules already carry Vite's exact resolved id, including
  // /@fs paths, query suffixes and virtual ids. Resolving the relative mock from
  // a deployment base instead would silently return the caller's raw mock id.
  const module = await server.moduleGraph?.getModuleByUrl(path)
  return module?.id ?? path
}
