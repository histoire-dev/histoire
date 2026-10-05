import type { InlineConfig, Plugin, ViteDevServer } from 'vite'
import { createServer } from 'vite'
import { RuntimeCleanupError, withCleanupDeadline } from '../runtime/cleanup.js'

/**
 * Captures Vite's earliest public server hook before user configureServer or
 * middleware buildStart can fail. Earlier internal construction exposes no
 * public server handle, so this adapter cannot close those hidden resources.
 */
export async function acquireViteServer(config: InlineConfig): Promise<ViteDevServer> {
  let captured: ViteDevServer | undefined
  const capture: Plugin = {
    name: 'histoire:owned-vite-acquisition',
    enforce: 'pre',
    configureServer: {
      order: 'pre',
      /** Records exact ownership before subsequent initialization hooks run. */
      handler(server) {
        captured = server
      },
    },
  }
  try {
    return await createServer({ ...config, plugins: [capture, ...config.plugins ?? []] })
  }
  catch (error) {
    if (captured) {
      const server = captured
      try {
        await withCleanupDeadline(Promise.resolve().then(() => server.close()))
      }
      catch (cleanupError) {
        throw new RuntimeCleanupError([error, cleanupError], String(error))
      }
    }
    throw error
  }
}
