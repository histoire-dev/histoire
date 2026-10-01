import type { ViteDevServer } from 'vite'

/**
 * Builds the two virtual-module invalidators the dev server uses.
 *
 * @param server Client-facing Vite dev server owning the module graph.
 */
export function createModuleInvalidators(server: ViteDevServer) {
  // Invalidate modules
  const invalidateModule = (id: string) => {
    const mod = server.moduleGraph.getModuleById(id)
    if (!mod) {
      return
    }
    server.moduleGraph.invalidateModule(mod)

    // Send HMR update
    const timestamp = Date.now()
    mod.lastHMRTimestamp = timestamp
    server.ws.send({
      type: 'update',
      updates: [
        {
          type: 'js-update',
          acceptedPath: mod.url,
          path: mod.url,
          timestamp,
        },
      ],
    })
  }

  // Invalidate without pushing a client update: the preview runtime is the
  // iframe entry module and does not self-accept — the fabricated self-accept
  // js-update above would re-execute the whole runtime inside live iframes
  // (duplicate message listeners, a second app mount). Invalidating the
  // transform is enough: fresh iframe loads get up-to-date story metadata and
  // stale running iframes reload themselves on a selection miss.
  const invalidateModuleSilently = (id: string) => {
    const mod = server.moduleGraph.getModuleById(id)
    if (!mod) {
      return
    }
    server.moduleGraph.invalidateModule(mod)
  }

  return {
    invalidateModule,
    invalidateModuleSilently,
  }
}
