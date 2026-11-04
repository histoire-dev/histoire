import type { HistoireStoryChangedPayload, ServerStoryFile } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { CollectionCache } from '../collect/catalog-cache.js'
import type { useCollectStories } from '../collect/index.js'
import type { StoryCollectionOutcome } from '../collect/outcome.js'
import type { Context } from '../context.js'
import { performance } from 'node:perf_hooks'
import { serialize } from 'node:v8'
import { STORY_CHANGED_EVENT } from '@histoire/shared'
import pc from 'picocolors'
import { restoreCollectedStoryFile } from '../collect/finalize.js'
import { withCleanupDeadline } from '../runtime/cleanup.js'
import { onStoryChange, onStoryListChange } from '../stories.js'
import { fileHasVitestMocks } from '../util/story-vitest.js'
import * as VirtualFiles from '../virtual/index.js'

export interface StoryCollectorOptions {
  /** Project context owned by this generation. */
  ctx: Context
  /** Client-facing Vite dev server, used to push progress/HMR messages. */
  server: ViteDevServer
  /** Story executor + cache control bound to the node-side collection server. */
  collectStories: Pick<ReturnType<typeof useCollectStories>, 'clearCache' | 'executeStoryFile'>
  invalidateModule: (id: string) => void
  invalidateModuleSilently: (id: string) => void
  /** Additional generation guard supplied by the runtime controller. */
  isActive?: () => boolean
  /** Catalog of the previous run, restored by `restore()`; rewritten after each batch. */
  cache?: Pick<CollectionCache, 'read' | 'write'>
  /** Observes loaded/total story files of every full collection, including background revalidation. */
  onProgress?: (progress: { loaded: number, total: number, revalidate: boolean }) => void
}

/** Collection lifecycle observed by generation-owned catalog publishers. */
export interface CollectionEvent {
  /** Completed events run after virtual module invalidation. */
  phase: 'started' | 'completed' | 'failed'
  /** Captured files executed in this batch, including the initial full scan. */
  files: ServerStoryFile[]
  /** Executor exception, when a batch cannot complete. */
  error?: unknown
  /** Last completed status of every still-registered file, including unchanged files. */
  outcomes: ReadonlyMap<string, StoryCollectionOutcome>
  /**
   * Background collection of a restored catalog: the restored catalog stays
   * executable while it runs, as it was complete when published.
   */
  revalidate?: boolean
}

/** Comparable snapshot of the collected metadata of all story files. */
function serializeStories(storyFiles: ServerStoryFile[]) {
  return serialize(storyFiles.map(file => [file.path, file.story ?? null, file.treePath ?? null]))
}

/**
 * Owns the dev-mode story collection loop: debounces file changes, re-executes
 * the story files, invalidates the virtual modules and announces the result to
 * the connected clients.
 *
 * Registers its own `onStoryChange` listener; call the returned `collect` once
 * to run the initial full collection.
 */
export function createStoryCollector(options: StoryCollectorOptions) {
  const { ctx, server, invalidateModule, invalidateModuleSilently } = options
  const { clearCache, executeStoryFile } = options.collectStories

  // onStoryChange debouncing
  let queued = false
  let queuedFiles: ServerStoryFile[] = []
  let currentFiles: ServerStoryFile[] = []
  let queueTimer
  let collecting = false
  let didAllStoriesYet = false
  let stopped = false
  let activeCollection: Promise<void> | undefined
  const collectionHandlers = new Set<(event: CollectionEvent) => void | Promise<void>>()
  const outcomes = new Map<string, StoryCollectionOutcome>()

  /** Prevents asynchronous work from publishing after stop or restart. */
  const isActive = () => !stopped && (options.isActive?.() ?? true)

  /** Sends completed batches only while this collector owns its generation. */
  async function announce(event: Omit<CollectionEvent, 'outcomes'>) {
    if (isActive()) {
      // Await catalog hashing/publication before executing a later queued
      // batch. Otherwise slow previous hashes could overwrite newer metadata.
      for (const handler of collectionHandlers) {
        if (!isActive()) return
        await handler({ ...event, outcomes: new Map(outcomes) })
      }
    }
  }

  const offStoryChange = onStoryChange(ctx, async (changedFile) => {
    if (!isActive()) return
    if (changedFile && !didAllStoriesYet && !collecting) {
      return
    }

    if (changedFile) {
      if (!queuedFiles.includes(changedFile)) {
        queuedFiles.push(changedFile)
      }
    }
    else {
      queuedFiles = []
    }

    if (!queued) {
      queued = true
      // Block admission during the debounce as well as worker execution. The
      // previously published metadata may no longer match files on disk.
      void announce({ phase: 'started', files: changedFile ? [changedFile] : ctx.storyFiles.slice() }).catch(error => console.error(error))
      if (!collecting) {
        clearTimeout(queueTimer)
        // Debounce
        queueTimer = setTimeout(() => {
          void collect().catch(error => console.error(error))
        }, 100)
      }
    }
  })

  const offStoryListChange = onStoryListChange(ctx, () => {
    if (isActive()) {
      queuedFiles = []
      queued = true
      void announce({ phase: 'started', files: ctx.storyFiles.slice() }).catch(error => console.error(error))
      if (!collecting) {
        clearTimeout(queueTimer)
        queueTimer = setTimeout(() => {
          void collect().catch(error => console.error(error))
        }, 100)
      }
    }
  })

  /** Refreshes the virtual modules that bake story metadata at transform time. */
  function invalidateCatalogModules() {
    invalidateModule(VirtualFiles.RESOLVED_STORIES_ID)
    invalidateModule(VirtualFiles.RESOLVED_SEARCH_TITLE_DATA_ID)
    invalidateModule(VirtualFiles.RESOLVED_BUILD_INFO_ID)
    invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)
  }

  async function runBatch(revalidate = false) {
    if (!isActive()) return
    collecting = true

    clearCache()

    currentFiles = queuedFiles.slice()
    queuedFiles = []
    queued = false
    const files = currentFiles.length ? currentFiles : ctx.storyFiles.slice()
    const paths = new Set(ctx.storyFiles.map(file => file.path))
    for (const key of outcomes.keys()) {
      if (!paths.has(key)) outcomes.delete(key)
    }
    const flag = revalidate ? { revalidate } : {}
    const before = revalidate ? serializeStories(ctx.storyFiles) : undefined
    await announce({ phase: 'started', files, ...flag })
    /** Records typed outcomes while keeping legacy injected executors compatible. */
    async function execute(file: ServerStoryFile) {
      const outcome = await executeStoryFile(file)
      outcomes.set(file.path, outcome ?? { status: file.story ? 'collected' : 'empty' })
    }

    console.log('Collect stories start', currentFiles.length ? currentFiles.map(f => f.fileName).join(', ') : 'all')
    const time = performance.now()
    // Buffered instead of sent inline: the app reloads the preview iframe on
    // this event and the fresh iframe re-imports the preview runtime virtual
    // module, which bakes story metadata at transform time. Sending here would
    // serve the stale cached transform (the invalidations below only run once
    // the whole batch is done), and since the runtime invalidation is
    // intentionally silent nothing would re-trigger a reload afterwards. This
    // is reproducible as soon as two story files change in one batch.
    const changedStories: HistoireStoryChangedPayload[] = []
    if (currentFiles.length) {
      await Promise.all(currentFiles.map(async (storyFile) => {
        const previousId = storyFile.story?.id
        await execute(storyFile)
        if (isActive() && previousId && previousId !== storyFile.story?.id) invalidateModule(VirtualFiles.getResolvedStorySourceId(previousId))
        if (isActive() && storyFile.story) {
          invalidateModule(VirtualFiles.getResolvedStorySourceId(storyFile.story.id))
          changedStories.push({
            storyId: storyFile.story.id,
            hasVitestMocks: fileHasVitestMocks(storyFile),
          })
        }
      }))
    }
    else {
      // Full update

      // Progress tracking
      const fileCount = ctx.storyFiles.length
      let loadedFilesCount = 0
      const sendProgress = () => {
        if (isActive()) options.onProgress?.({ loaded: loadedFilesCount, total: fileCount, revalidate })
        if (!isActive() || revalidate) return
        server.ws.send('histoire:stories-loading-progress', {
          loadedFileCount: loadedFilesCount,
          totalFileCount: fileCount,
        })
      }

      sendProgress()

      await Promise.all(files.map(async (storyFile) => {
        await execute(storyFile)
        loadedFilesCount++
        sendProgress()
      }))

      didAllStoriesYet = true
      if (isActive() && !revalidate) server.ws.send('histoire:all-stories-loaded', {})
    }
    if (!isActive()) return
    console.log(`Collect stories end ${pc.bold(pc.blue(Math.round(performance.now() - time)))}ms`)
    options.cache?.write(ctx.storyFiles, outcomes).catch(error => console.warn(pc.yellow(`Could not write the story collection cache: ${error}`)))

    // Unchanged revalidated metadata must not reload the workbench or its frames.
    if (!before?.equals(serializeStories(ctx.storyFiles))) invalidateCatalogModules()

    // Ordering guarantee: story-changed events are only announced once the
    // virtual modules above are invalidated, so any iframe reload they trigger
    // re-imports a freshly transformed preview runtime.
    for (const changedStory of changedStories) {
      server.ws.send(STORY_CHANGED_EVENT, changedStory)
    }
    await announce({ phase: 'completed', files, ...flag })
  }

  /**
   * Publishes the cached catalog of the previous run, when it is still valid
   * for every registered story file, instead of waiting for a first collection.
   * @returns Whether the cached catalog was published; call `revalidate()` then.
   */
  async function restore(): Promise<boolean> {
    if (!isActive() || !options.cache || collecting) return false
    const cached = await options.cache.read(ctx.storyFiles).catch(() => undefined)
    if (!cached || !isActive() || collecting) return false
    const files = ctx.storyFiles.filter(file => cached.has(file.path))
    for (const file of files) {
      restoreCollectedStoryFile(file, ctx, cached.get(file.path))
      outcomes.set(file.path, cached.get(file.path)!)
    }
    // Restored catalog is complete: later file changes collect as usual.
    didAllStoriesYet = true
    console.log(`Restored ${files.length} story file${files.length === 1 ? '' : 's'} from the collection cache`)
    invalidateCatalogModules()
    await announce({ phase: 'completed', files })
    return true
  }

  /** Collects every story again after `restore()`, publishing only differences. */
  function revalidate(): Promise<void> {
    if (!isActive()) return Promise.resolve()
    // Queued file changes already re-collect them, blocking admission as usual.
    if (activeCollection || queued) return collect()
    return run(() => runBatch(true))
  }

  /** Joins active work rather than executing two collection batches at once. */
  function collect(): Promise<void> {
    if (!isActive()) return Promise.resolve()
    if (activeCollection) return activeCollection
    return run(runBatch)
  }

  /** Runs `first`, then batches queued meanwhile, as the single active collection. */
  function run(first: () => Promise<void>): Promise<void> {
    activeCollection = (async () => {
      try {
        await first()
        while (queued && isActive()) {
          await runBatch()
        }
      }
      catch (error) {
        await announce({ phase: 'failed', files: currentFiles.slice(), error })
        throw error
      }
      finally {
        collecting = false
        activeCollection = undefined
      }
    })()
    return activeCollection
  }

  /**
   * Stops the collection loop: drops the story listener and cancels a debounce
   * still pending, which would otherwise collect into a closed dev server.
   */
  function stop() {
    stopped = true
    clearTimeout(queueTimer)
    offStoryChange()
    offStoryListChange()
    collectionHandlers.clear()
    queued = false
    return withCleanupDeadline(activeCollection?.catch(() => {}) ?? Promise.resolve())
  }

  return {
    collect,
    restore,
    revalidate,
    stop,
    /** Private typed status snapshot used when initial collection finished before subscription. */
    get outcomes() { return new Map(outcomes) },
    /** Observes completed batches without coupling collection to an MCP SDK. */
    onCollection(handler: (event: CollectionEvent) => void | Promise<void>) {
      collectionHandlers.add(handler)
      return () => {
        collectionHandlers.delete(handler)
      }
    },
  }
}
