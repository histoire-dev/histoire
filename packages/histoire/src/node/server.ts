import { createServer as createViteServer } from 'vite'
import { Context } from './context.js'
import { createVitePlugins, RESOLVED_STORIES_ID } from './plugin.js'
import { onStoryChange, watchStories } from './stories.js'

export async function createServer (ctx: Context) {
  await watchStories(ctx)
  const server = await createViteServer({
    root: ctx.config.sourceDir,
    plugins: await createVitePlugins(ctx),
    server: {
      watch: {
        usePolling: true,
      },
    },
  })
  onStoryChange(() => {
    const mod = server.moduleGraph.getModuleById(RESOLVED_STORIES_ID)
    if (mod) {
      server.moduleGraph.invalidateModule(mod)
      const timestamp = Date.now()
      mod.lastHMRTimestamp = timestamp
      server.ws.send({
        type: 'update',
        updates: [
          {
            type: 'js-update',
            acceptedPath: mod.url,
            path: mod.url,
            timestamp: timestamp,
          },
        ],
      })
    }
  })
  return server
}
