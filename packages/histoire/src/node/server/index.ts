import type { Context } from '../context.js'
import type { CreateServerOptions } from './vite-servers.js'
import { useCollectStories } from '../collect/index.js'
import { useModuleLoader } from '../load.js'
import { createMarkdownFilesWatcher, onMarkdownListChange } from '../markdown.js'
import { DevPluginApi } from '../plugin.js'
import { onStoryListChange, watchStories } from '../stories.js'
import { wrapLogError } from '../util/log.js'
import * as VirtualFiles from '../virtual/index.js'
import { createStoryCollector } from './collect.js'
import { registerDevEvents } from './dev-events.js'
import { createModuleInvalidators } from './invalidate.js'
import { createViteServers } from './vite-servers.js'

export type { CreateServerOptions } from './vite-servers.js'

/**
 * Starts the Histoire dev server: the Vite servers, the story/markdown
 * watchers, the plugin dev hooks and the story collection loop.
 */
export async function createServer(ctx: Context, options: CreateServerOptions = {}) {
  const { nodeServer, server, viteConfigFile } = await createViteServers(ctx, options)
  const storyWatcher = await watchStories(ctx)
  const { stop: stopMdFileWatcher } = await createMarkdownFilesWatcher(ctx)

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

  registerDevEvents(ctx, server, moduleLoader)

  // Wait for pre-bundling (in `listen()`)
  await server.listen(options.port ?? server.config.server?.port)

  const collectStories = useCollectStories({
    server: nodeServer,
    mainServer: server,
  }, ctx)

  const { invalidateModule, invalidateModuleSilently } = createModuleInvalidators(server)

  const { collect, stop: stopStoryCollector } = createStoryCollector({
    ctx,
    server,
    collectStories,
    invalidateModule,
    invalidateModuleSilently,
  })

  // Every listener registered here lives in a module-global list, so a server
  // that closes without removing them (a config change restarts it) leaves one
  // more copy of them running against a dead server on every restart.
  const offStoryListChange = onStoryListChange(() => {
    invalidateModule(VirtualFiles.RESOLVED_STORIES_ID)
    invalidateModule(VirtualFiles.RESOLVED_SEARCH_TITLE_DATA_ID)
    invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)
  })

  const offMarkdownListChange = onMarkdownListChange(() => {
    invalidateModule(VirtualFiles.RESOLVED_MARKDOWN_FILES)
  })

  async function close() {
    for (const cb of pluginOnCleanups) {
      await wrapLogError('plugin.onDev.onCleanup', () => cb())
    }
    stopStoryCollector()
    offStoryListChange()
    offMarkdownListChange()
    await wrapLogError('server.close', () => server.close())
    await wrapLogError('nodeServer', () => nodeServer.close())
    await wrapLogError('destroyCollectStories', () => collectStories.destroy())
    await wrapLogError('storyWatcher', () => storyWatcher.close())
    await wrapLogError('stopMdFileWatcher', () => stopMdFileWatcher())
  }

  collect()

  return {
    server,
    viteConfigFile,
    close,
  }
}
