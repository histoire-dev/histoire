import type { Context } from '../context.js'
import { createServer as createViteServer, mergeConfig as mergeViteConfig } from 'vite'
import { RuntimeCleanupError } from '../runtime/cleanup.js'
import { getViteConfigWithPlugins } from '../vite/index.js'

export interface CreateServerOptions {
  /** Client-facing Vite port; zero selects an ephemeral port. */
  port?: number
  /** Opens the book in the browser after listen. */
  open?: boolean
  /** Client-facing Vite binding, independent from an MCP listener. */
  host?: string | boolean
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
    const { viteConfig, viteConfigFile } = await getViteConfigWithPlugins(collecting, ctx)

    if (!collecting) {
      if (options.open !== undefined) {
        viteConfig.server.open = options.open
      }

      if (options.host) {
        viteConfig.server.host = options.host
      }
    }

    const server = await createViteServer(
      mergeViteConfig(viteConfig, {
        optimizeDeps: { include: viteConfig.optimizeDeps?.include ?? [], noDiscovery: collecting },
      }),
    )
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
  const { server: nodeServer } = await getViteServer(true) // Run before normal vite to prevent breaking HMR in Nuxt
  try {
    const { server, viteConfigFile } = await getViteServer(false)
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
