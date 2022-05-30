import { createServer as createViteServer } from 'vite'
import { Context } from './context.js'
import { createVitePlugins, RESOLVED_SEARCH_TITLE_DATA_ID, RESOLVED_STORIES_ID } from './vite.js'
import { notifyStoryChange, onStoryChange, watchStories } from './stories.js'
import { useCollectStories } from './collect/index.js'
import type { StoryFile } from './types.js'
import { DevPluginApi } from './plugin.js'
import { useModuleLoader } from './load.js'

export async function createServer (ctx: Context, port: number) {
  const server = await createViteServer({
    plugins: await createVitePlugins(false, ctx),
  })
  await server.pluginContainer.buildStart({})

  const nodeServer = await createViteServer({
    plugins: await createVitePlugins(true, ctx),
  })
  await nodeServer.pluginContainer.buildStart({})

  const moduleLoader = useModuleLoader({
    server: nodeServer,
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
    server: nodeServer,
  }, ctx)

  // onStoryChange debouncing
  let queue: Promise<void>
  let queueResolve: () => void
  let queued = false
  let queuedFiles: StoryFile[] = []
  let queuedAll = false
  let didAllStoriesYet = false

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
          timestamp: timestamp,
        },
      ],
    })
  }

  onStoryChange(async (changedFile) => {
    if (changedFile && !didAllStoriesYet) {
      return
    }
    if (queue) {
      if (queued) {
        if (changedFile) {
          queuedFiles.push(changedFile)
        } else {
          queuedAll = true
        }
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

    console.log('Collect stories start', changedFile?.path ?? 'all')
    const time = Date.now()
    if (changedFile && !queuedAll) {
      // Granular update
      await executeStoryFile(changedFile)

      // Queued updates
      await Promise.all(queuedFiles.map(storyFile => executeStoryFile(storyFile)))
    } else {
      // Full update

      // Progress tracking
      const fileCount = ctx.storyFiles.length
      let loadedFilesCount = 0
      const sendProgress = () => {
        server.ws.send('histoire:stories-loading-progress', {
          loadedFileCount: loadedFilesCount,
          totalFileCount: fileCount,
        })
      }

      sendProgress()
    
      await Promise.all(ctx.storyFiles.map(async storyFile => {
        await executeStoryFile(storyFile)
        loadedFilesCount++
        sendProgress()
      }))
  
      didAllStoriesYet = true
      server.ws.send('histoire:all-stories-loaded', {})
    }
    console.log('Collect stories end', Date.now() - time, 'ms')

    queuedFiles = []
    queuedAll = false
    queueResolve()

    invalidateModule(RESOLVED_STORIES_ID)
    invalidateModule(RESOLVED_SEARCH_TITLE_DATA_ID)
  })

  async function close () {
    for (const cb of pluginOnCleanups) {
      await cb()
    }
    await server.close()
    await nodeServer.close()
    await destroyCollectStories()
  }

  return {
    server,
    close,
  }
}
