import { performance } from 'node:perf_hooks'
import { createServer as createViteServer } from 'vite'
import pc from 'picocolors'
import type { ServerStoryFile } from '@histoire/shared'
import { Context } from './context.js'
import { getViteConfigWithPlugins, RESOLVED_MARKDOWN_FILES, RESOLVED_SEARCH_TITLE_DATA_ID, RESOLVED_STORIES_ID } from './vite.js'
import { onStoryChange, onStoryListChange, watchStories } from './stories.js'
import { useCollectStories } from './collect/index.js'
import { DevPluginApi } from './plugin.js'
import { useModuleLoader } from './load.js'
import { wrapLogError } from './util/log.js'
import { createMarkdownFilesWatcher, onMarkdownListChange } from './markdown.js'

export interface CreateServerOptions {
  port?: number
}

export async function createServer (ctx: Context, options: CreateServerOptions = {}) {
  const server = await createViteServer(await getViteConfigWithPlugins(false, ctx))
  await server.pluginContainer.buildStart({})

  const nodeServer = await createViteServer(await getViteConfigWithPlugins(true, ctx))
  await nodeServer.pluginContainer.buildStart({})

  const moduleLoader = useModuleLoader({
    server: nodeServer,
  })

  await watchStories(ctx)

  const { stop: stopMdFileWatcher } = await createMarkdownFilesWatcher(ctx)

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

  // Wait for pre-bundling (in `listen()`)
  await server.listen(options.port ?? server.config.server?.port)

  const {
    clearCache,
    executeStoryFile,
    destroy: destroyCollectStories,
    clearInvalidates,
  } = useCollectStories({
    server: nodeServer,
    mainServer: server,
  }, ctx)

  // onStoryChange debouncing
  let queued = false
  let queuedFiles: ServerStoryFile[] = []
  let queueTimer
  let collecting = false
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

    if (changedFile) {
      if (!queuedFiles.includes(changedFile)) {
        queuedFiles.push(changedFile)
      }
    } else {
      queuedFiles = []
    }

    if (!queued) {
      queued = true
      if (!collecting) {
        clearTimeout(queueTimer)
        // Debounce
        queueTimer = setTimeout(collect, 100)
      }
    }
  })

  async function collect () {
    collecting = true

    clearCache()

    const currentFiles = queuedFiles.slice()
    queuedFiles = []
    queued = false

    console.log('Collect stories start', currentFiles.length ? currentFiles.map(f => f.fileName).join(', ') : 'all')
    const time = performance.now()
    if (currentFiles.length) {
      await Promise.all(currentFiles.map(async storyFile => {
        await executeStoryFile(storyFile)
        if (storyFile.story) {
          await invalidateModule(`/__resolved__virtual:story-source:${storyFile.story.id}`)
        }
      }))
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
    console.log(`Collect stories end ${pc.bold(pc.blue(Math.round(performance.now() - time)))}ms`)

    clearInvalidates()

    invalidateModule(RESOLVED_STORIES_ID)
    invalidateModule(RESOLVED_SEARCH_TITLE_DATA_ID)

    collecting = false

    if (queued) {
      await collect()
    }
  }

  onStoryListChange(() => {
    invalidateModule(RESOLVED_STORIES_ID)
    invalidateModule(RESOLVED_SEARCH_TITLE_DATA_ID)
  })

  onMarkdownListChange(() => {
    invalidateModule(RESOLVED_MARKDOWN_FILES)
  })

  async function close () {
    for (const cb of pluginOnCleanups) {
      await wrapLogError('plugin.onDev.onCleanup', () => cb())
    }
    await wrapLogError('server.close', () => server.close())
    await wrapLogError('nodeServer', () => nodeServer.close())
    await wrapLogError('destroyCollectStories', () => destroyCollectStories())
    await wrapLogError('stopMdFileWatcher', () => stopMdFileWatcher())
  }

  return {
    server,
    close,
  }
}
