import type { Context } from '../context.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import type { CreateServerOptions as ViteServerOptions } from './vite-servers.js'
import { createCollectionCache } from '../collect/catalog-cache.js'
import { useCollectStories } from '../collect/index.js'
import { useModuleLoader } from '../load.js'
import { createMarkdownFilesWatcher, onMarkdownListChange } from '../markdown.js'
import { DevPluginApi } from '../plugin.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { resolveDevServerPort } from '../runtime/port.js'
import { getContextRegistry } from '../runtime/registry.js'
import { inertProgress } from '../runtime/terminal/progress.js'
import { waitForRuntimeWork } from '../runtime/wait.js'
import { onStoryListChange, watchStories } from '../stories.js'
import { attachTestCollectionEligibility } from '../test/eligibility/index.js'
import * as VirtualFiles from '../virtual/index.js'
import { closeDevPreviewHost } from '../vite/mcp-preview-html.js'
import { createStoryCollector } from './collect.js'
import { registerDevEvents } from './dev-events.js'
import { runInitialCollection } from './initial-collection.js'
import { createModuleInvalidators } from './invalidate.js'
import { registerAgentsChannel } from './ui-channel/agents.js'
import { registerAiThreadsChannel } from './ui-channel/ai-threads.js'
import { registerConfigChannel } from './ui-channel/config.js'
import { registerUiChannel } from './ui-channel/index.js'
import { registerPluginToggleHttp } from './ui-channel/plugin-toggle-http.js'
import { createViteServers } from './vite-servers.js'

/** Dev generation startup and publication ownership. */
export interface CreateServerOptions extends ViteServerOptions {
  /** Headless consumers can omit agent/comment service acquisition. */
  agents?: boolean
  /** Cancels startup when its owning controller closes or restarts. */
  signal?: AbortSignal
  /** Suppresses publication from a superseded runtime generation. */
  isActive?: () => boolean
  /** Controller-owned shared lane for UI fallback tests and MCP operations. */
  execution?: ExecutionService
}

/** Starts both Vite servers and owns their watchers, collection and plugin hooks. */
export async function createServer(ctx: Context, options: CreateServerOptions = {}) {
  const cleanup = getContextRegistry(ctx).cleanup
  let stopped = false
  let stopCollection: (() => Promise<void>) | undefined
  const isActive = () => !stopped && !options.signal?.aborted && (options.isActive?.() ?? true)
  const execution = options.execution ?? createExecutionService()
  const progress = options.progress ?? inertProgress
  getContextRegistry(ctx).execution = { service: execution, isActive }
  if (!options.execution) cleanup.add(() => execution.close())
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
    if (options.middleware?.base) ctx.resolvedViteConfig = { ...ctx.resolvedViteConfig, base: options.middleware.base }
    const { nodeServer, server, viteConfigFile } = await progress.track('vite', () => createViteServers(ctx, options))
    cleanup.add(() => nodeServer.close())
    cleanup.add(() => server.close())
    cleanup.add(() => closeDevPreviewHost(server))
    checkActive()

    await progress.track('scan', async () => {
      const storyWatcher = await watchStories(ctx)
      cleanup.add(() => storyWatcher.close())
      await waitForRuntimeWork(storyWatcher.ready, options.signal)
    })
    checkActive()
    // Markdown associations require the complete story scan, including siblings.
    await progress.track('markdown', () => createMarkdownFilesWatcher(ctx, options.signal))
    checkActive()

    const moduleLoader = useModuleLoader({ server: nodeServer })
    const hooked = ctx.config.plugins.filter(plugin => plugin.onDev)
    if (hooked.length) {
      await progress.track('plugins', async () => {
        for (const plugin of hooked) {
          progress.update('plugins', { label: plugin.name })
          await plugin.onDev!(new DevPluginApi(ctx, plugin, moduleLoader), callback => cleanup.add(callback))
          checkActive()
        }
      })
    }
    attachTestCollectionEligibility(ctx, server)
    registerDevEvents(ctx, server, moduleLoader, execution, isActive)
    const uiChannel = registerUiChannel(ctx, server, execution, isActive)
    cleanup.add(registerPluginToggleHttp(ctx, server, isActive))
    registerConfigChannel(ctx, uiChannel, isActive)
    if (options.agents !== false) {
      const agents = registerAgentsChannel(ctx, uiChannel, server)
      registerAiThreadsChannel(ctx, uiChannel, agents, isActive, server)
    }
    cleanup.add(() => uiChannel.close())
    // Vite pre-bundling completes during listen; initial collection follows it.
    if (!options.middleware) {
      const port = await resolveDevServerPort(options.port ?? server.config.server?.port)
      checkActive()
      await progress.track('listen', () => server.listen(port))
      if (options.devProxy) server.resolvedUrls = { local: [new URL(server.config.base, options.devProxy.origin).href], network: [] }
    }
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
    collector = createStoryCollector({ ctx, server, collectStories, invalidateModule, invalidateModuleSilently, isActive, cache: createCollectionCache(ctx), onProgress: ({ loaded, total, revalidate }) => progress.update(revalidate ? 'revalidate' : 'collect', { current: loaded, total }) })
    stopCollection = collector.stop

    cleanup.add(onStoryListChange(ctx, () => {
      if (!isActive()) return
      invalidateModule(VirtualFiles.RESOLVED_STORIES_ID)
      invalidateModule(VirtualFiles.RESOLVED_SEARCH_TITLE_DATA_ID)
      invalidateModule(VirtualFiles.RESOLVED_BUILD_INFO_ID)
      invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)
    }))
    cleanup.add(onMarkdownListChange(ctx, () => {
      if (isActive()) invalidateModule(VirtualFiles.RESOLVED_MARKDOWN_FILES)
    }))
    // The previous run's catalog, when still valid, spares waiting for a first
    // collection (story files boot the whole app) and for the client warmup:
    // its stories import what they imported last run. Both run afterwards,
    // one after the other, so the first frames keep most of the main thread.
    const ready = runInitialCollection({ collector, server, progress, fresh: options.fresh, checkActive })
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
