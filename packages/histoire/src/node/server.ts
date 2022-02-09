import { createServer as createViteServer } from 'vite'
import { Context } from './context.js'
import { createVitePlugins, RESOLVED_STORIES_ID } from './plugin.js'
import { onStoryChange, watchStories } from './stories.js'
import { useCollectStories } from './collect.js'
import type { StoryFile } from './types.js'

export async function createServer (ctx: Context, port: number) {
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
  await server.pluginContainer.buildStart({})
  // Wait for pre-bundling (in `listen()`)
  await server.listen(port)

  const {
    clearCache,
    executeStoryFile,
    destroy: destroyCollectStories,
  } = useCollectStories(server)

  // onStoryChange debouncing
  let queue: Promise<void>
  let queueResolve: () => void
  let queued = false
  let queuedFiles: StoryFile[] = []

  onStoryChange(async (changedFile) => {
    if (queue) {
      if (queued) {
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

    // Invalidate stories data module
    const mod = server.moduleGraph.getModuleById(RESOLVED_STORIES_ID)
    if (!mod) {
      return
    }
    server.moduleGraph.invalidateModule(mod)

    // Send stories data HMR update
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
  })

  async function close () {
    await server.close()
    await destroyCollectStories()
  }

  return {
    server,
    close,
  }
}
