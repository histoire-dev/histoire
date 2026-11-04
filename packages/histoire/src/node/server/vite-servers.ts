import type { Context } from '../context.js'
import type { MiddlewareHostingOptions } from '../runtime/hosting/types.js'
import type { StartupProgress } from '../runtime/terminal/progress.js'
import type { DevProxyTransport } from '../vite/dev-proxy.js'
import { mergeConfig as mergeViteConfig } from 'vite'
import { RuntimeCleanupError } from '../runtime/cleanup.js'
import { createHostingHmr, createHostingProxyEvents } from '../runtime/hosting/hmr.js'
import { acquireViteServer as createViteServer } from '../vite/acquire-server.js'
import { createDevProxyPlugin } from '../vite/dev-proxy.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { collectionWatchPlugin, forwardWatcherEvents } from './collection-watcher.js'

export interface CreateServerOptions {
  /** CLI-only proxy transport; SDK retains existing listener ownership. */
  devProxy?: DevProxyTransport
  /** Client-facing Vite port; zero selects an ephemeral port. */
  port?: number
  /** Opens the book in the browser after listen. */
  open?: boolean
  /** Client-facing Vite binding, independent from an MCP listener. */
  host?: string | boolean
  /** SDK listeners share middleware lifecycle without Vite-owned process handlers. */
  middleware?: MiddlewareHostingOptions
  /** Internal observer of real startup work; absent is inert. */
  progress?: StartupProgress
  /**
   * One-shot fresh generation: the client server re-optimizes its dependencies
   * instead of reusing the cache it owns, and the catalog cache is not restored.
   */
  fresh?: boolean
}

/**
 * Creates the two Vite dev servers the dev mode runs on: one dedicated to story
 * collection (`collecting: true`) and the client-facing one.
 *
 * They are created sequentially on purpose, so each gets a freshly evaluated
 * `vite.config.js` — creating the collecting one second breaks HMR in Nuxt.
 */
export async function createViteServers(ctx: Context, options: CreateServerOptions) {
  const getViteServer = async (collecting: boolean) => {
    options.progress?.update('vite', { label: collecting ? 'collection server' : 'client server' })
    const { viteConfig, viteConfigFile } = await getViteConfigWithPlugins(collecting, ctx)
    let proxyEvents: ReturnType<typeof createHostingProxyEvents> | undefined
    if (options.middleware) {
      const base = options.middleware.base ?? viteConfig.base ?? '/'
      viteConfig.base = base
      if (collecting) {
        // Middleware-mode Vite still opens standalone WebSocket server on shared default port 24678 when `hmr` is
        // disabled. Node-only collection has no browser clients, so disable it to avoid cross-process port conflicts.
        viteConfig.server = { ...viteConfig.server, middlewareMode: true, hmr: false, ws: false }
      }
      else {
        proxyEvents = createHostingProxyEvents(options.middleware.httpServer, base, viteConfig.server.proxy)
        viteConfig.server = { ...viteConfig.server, middlewareMode: { server: proxyEvents.server }, hmr: createHostingHmr(options.middleware.httpServer, base, options.middleware.publicOrigin), ...(options.middleware.publicOrigin ? { origin: options.middleware.publicOrigin } : {}) }
      }
      const hostingServer = { middlewareMode: viteConfig.server.middlewareMode, hmr: viteConfig.server.hmr, origin: viteConfig.server.origin }
      // Histoire/framework config hooks can replace the inline HMR object.
      // Final config ownership must still pin HMR to the supplied server.
      viteConfig.plugins.push({ name: 'histoire:owned-hosting', enforce: 'post', config: () => ({ base, server: hostingServer }) })
    }

    // The client server crawls the project; its file events are replayed here.
    if (collecting) viteConfig.plugins.push(collectionWatchPlugin())

    if (!collecting) {
      if (options.open !== undefined) {
        viteConfig.server.open = options.open
      }

      if (options.host) {
        viteConfig.server.host = options.host
      }
    }

    if (options.devProxy) viteConfig.plugins.push(createDevProxyPlugin(options.devProxy, collecting))
    let server: Awaited<ReturnType<typeof createViteServer>>
    try {
      server = await createViteServer(
        mergeViteConfig(viteConfig, {
          // Collection must not discover browser dependencies. Client config
          // retains its explicit policy and inherited include list exactly once.
          optimizeDeps: {
            noDiscovery: collecting ? true : viteConfig.optimizeDeps?.noDiscovery ?? false,
            // Vite removes only the cache directory this server owns (never another context's).
            ...(options.fresh && !collecting ? { force: true } : {}),
          },
        }),
      )
    }
    catch (error) {
      proxyEvents?.close()
      throw error
    }
    const closeServer = server.close.bind(server)
    if (proxyEvents) {
      server.close = async () => {
        try {
          await closeServer()
        }
        finally {
          proxyEvents.close()
        }
      }
    }
    try {
      await server.pluginContainer.buildStart({})
    }
    catch (error) {
      try {
        await server.close()
      }
      catch (cleanupError) {
        throw new RuntimeCleanupError([error, cleanupError], String(error))
      }
      throw error
    }
    return {
      server,
      viteConfigFile,
    }
  }

  // Should be run sequentially to get a fresh vite.config.js each time
  const { server: nodeServer } = await getViteServer(true)
  // Run before normal vite to prevent breaking HMR in Nuxt
  try {
    const { server, viteConfigFile } = await getViteServer(false)
    forwardWatcherEvents(server, nodeServer)
    return { nodeServer, server, viteConfigFile }
  }
  catch (error) {
    try {
      await nodeServer.close()
    }
    catch (cleanupError) {
      throw new RuntimeCleanupError([error, cleanupError], String(error))
    }
    throw error
  }
}
