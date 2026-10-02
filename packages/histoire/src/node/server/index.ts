import type { Context } from '../context.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import type { CreateServerOptions as ViteServerOptions } from './vite-servers.js'
import { useCollectStories } from '../collect/index.js'
import { useModuleLoader } from '../load.js'
import { createMarkdownFilesWatcher, onMarkdownListChange } from '../markdown.js'
import { DevPluginApi } from '../plugin.js'
import { createCleanupStack } from '../runtime/cleanup.js'
import { resolveDevServerPort } from '../runtime/port.js'
import { waitForRuntimeWork } from '../runtime/wait.js'
import { onStoryListChange, watchStories } from '../stories.js'
import * as VirtualFiles from '../virtual/index.js'
import { createStoryCollector } from './collect.js'
import { registerDevEvents } from './dev-events.js'
import { createModuleInvalidators } from './invalidate.js'
import { createViteServers } from './vite-servers.js'

/** Dev generation startup and publication ownership. */
export interface CreateServerOptions extends ViteServerOptions {
  /** Cancels startup when its owning controller closes or restarts. */
  signal?: AbortSignal
  /** Suppresses publication from a superseded runtime generation. */
  isActive?: () => boolean
  /** Controller-owned shared lane for UI fallback tests and MCP operations. */
  execution?: ExecutionService
}

/** Starts both Vite servers and owns their watchers, collection and plugin hooks. */
export async function createServer(ctx: Context, options: CreateServerOptions = {}) {
  const cleanup = createCleanupStack()
  let stopped = false
  let stopCollection: (() => Promise<void>) | undefined
  const isActive = () => !stopped && !options.signal?.aborted && (options.isActive?.() ?? true)
  /** Rejects work acquired after a startup cancellation. */
  function checkActive() {
    options.signal?.throwIfAborted()
    if (!isActive()) throw new Error('Project runtime closed')
  }
  /** Stops publication synchronously before closing acquired resources. */
  function close() {
    stopped = true
    // Stop hooks/listeners synchronously; worker destruction below can then
    // unblock pending collection before its bounded drain is awaited.
    void stopCollection?.().catch(() => {})
    return cleanup.close()
  }
  try {
    checkActive()
    const { nodeServer, server, viteConfigFile } = await createViteServers(ctx, options)
    cleanup.add(() => nodeServer.close())
    cleanup.add(() => server.close())
    checkActive()

    const storyWatcher = await watchStories(ctx)
    cleanup.add(() => storyWatcher.close())
    await waitForRuntimeWork(storyWatcher.ready, options.signal)
    checkActive()
    // Markdown associations require the complete story scan, including siblings.
    const { stop: stopMdFileWatcher } = await createMarkdownFilesWatcher(ctx, options.signal)
    cleanup.add(stopMdFileWatcher)
    checkActive()

    const moduleLoader = useModuleLoader({ server: nodeServer })
    for (const plugin of ctx.config.plugins) {
      if (plugin.onDev) {
        const api = new DevPluginApi(ctx, plugin, moduleLoader)
        await plugin.onDev(api, callback => cleanup.add(callback))
        checkActive()
      }
    }
    registerDevEvents(ctx, server, moduleLoader, options.execution, isActive)
    // Vite pre-bundling completes during listen; initial collection follows it.
    const port = await resolveDevServerPort(options.port ?? server.config.server?.port)
    checkActive()
    await server.listen(port)
    checkActive()

    const collectStories = useCollectStories({ server: nodeServer, mainServer: server }, ctx)
    const { invalidateModule, invalidateModuleSilently } = createModuleInvalidators(server)
    let collector: ReturnType<typeof createStoryCollector> | undefined
    cleanup.add(async () => {
      const draining = collector?.stop()
      try {
        await collectStories.destroy()
      }
      finally { await draining }
    })
    collector = createStoryCollector({ ctx, server, collectStories, invalidateModule, invalidateModuleSilently, isActive })
    stopCollection = collector.stop

    cleanup.add(onStoryListChange(() => {
      if (!isActive()) return
      invalidateModule(VirtualFiles.RESOLVED_STORIES_ID)
      invalidateModule(VirtualFiles.RESOLVED_SEARCH_TITLE_DATA_ID)
      invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)
    }))
    cleanup.add(onMarkdownListChange(() => {
      if (isActive()) invalidateModule(VirtualFiles.RESOLVED_MARKDOWN_FILES)
    }))
    const ready = collector.collect()
    // Returned readiness still rejects for callers, but ordinary dev never leaks
    // an unhandled rejection while the controller attaches its observer.
    void ready.catch(() => {})
    return {
      server,
      viteConfigFile,
      ready,
      collect: collector.collect,
      onCollection: collector.onCollection,
      get collectionOutcomes() {
        return collector.outcomes
      },
      close,
    }
  }
  catch (error) {
    try {
      await close()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], String(error))
    }
    throw error
  }
}
