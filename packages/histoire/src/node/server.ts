import { createServer as createViteServer } from 'vite'
import { Context } from './context.js'
import { createVitePlugins, RESOLVED_SEARCH_DATA_ID, RESOLVED_STORIES_ID } from './vite.js'
import { notifyStoryChange, onStoryChange, watchStories } from './stories.js'
import { useCollectStories } from './collect/index.js'
import type { StoryFile } from './types.js'
import { DevPluginApi } from './plugin.js'
import { useModuleLoader } from './load.js'

export async function createServer (ctx: Context, port: number) {
  const server = await createViteServer({
    plugins: await createVitePlugins(ctx),
    server: {
      watch: {
        usePolling: true,
      },
    },
  })
  await server.pluginContainer.buildStart({})

  const moduleLoader = useModuleLoader({
    server,
  })

  const pluginOnCleanups: (() => void | Promise<void>)[] = []
  for (const plugin of ctx.config.plugins) {
    if (plugin.onDev) {
      const api = new DevPluginApi(ctx, plugin, moduleLoader)
      const onCleanup = (cb: () => void | Promise<void>) => {
        pluginOnCleanups.push(cb)
      }
      await plugin.onDev(api, onCleanup)
    }
  }

  await watchStories(ctx)

  // Wait for pre-bundling (in `listen()`)
  await server.listen(port)

  const {
    clearCache,
    executeStoryFile,
    destroy: destroyCollectStories,
  } = useCollectStories({
    server,
  }, ctx)

  // onStoryChange debouncing
  let queue: Promise<void>
  let queueResolve: () => void
  let queued = false
  let queuedFiles: StoryFile[] = []

  onStoryChange(async (changedFile) => {
    if (queue) {
      if (queued && changedFile) {
        queuedFiles.push(changedFile)
        return
      } else {
        queued = true
        // Next call
        await queue
      }
    }
    queued = false
    queue = new Promise(resolve => {
      queueResolve = resolve
    })

    clearCache()

    if (changedFile) {
      // Granular update
      await executeStoryFile(changedFile)
    } else {
      // Full update
      for (const storyFile of ctx.storyFiles) {
        await executeStoryFile(storyFile)
      }
    }
    // Queued updates
    for (const storyFile of queuedFiles) {
      await executeStoryFile(storyFile)
    }

    queuedFiles = []
    queueResolve()

    // Invalidate modules
    function invalidateModule (id: string) {
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
            timestamp: timestamp,
          },
        ],
      })
    }

    invalidateModule(RESOLVED_STORIES_ID)
    invalidateModule(RESOLVED_SEARCH_DATA_ID)
  })

  async function close () {
    for (const cb of pluginOnCleanups) {
      await cb()
    }
    await server.close()
    await destroyCollectStories()
  }

  // On page refresh, refresh stories
  // Useful when vite optimizes new dependencies
  server.ws.on('connection', (socket) => {
    if (socket.protocol === 'vite-hmr') {
      notifyStoryChange()
    }
  })

  return {
    server,
    close,
  }
}
