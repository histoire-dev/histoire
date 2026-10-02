import type { HistoireStoryChangedPayload, ServerStoryFile } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { useCollectStories } from '../collect/index.js'
import type { StoryCollectionOutcome } from '../collect/outcome.js'
import type { Context } from '../context.js'
import { performance } from 'node:perf_hooks'
import { STORY_CHANGED_EVENT } from '@histoire/shared'
import pc from 'picocolors'
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

  const offStoryChange = onStoryChange(async (changedFile) => {
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

  const offStoryListChange = onStoryListChange(() => {
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

  async function runBatch() {
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
    await announce({ phase: 'started', files })
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
        if (!isActive()) return
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
      if (isActive()) server.ws.send('histoire:all-stories-loaded', {})
    }
    if (!isActive()) return
    console.log(`Collect stories end ${pc.bold(pc.blue(Math.round(performance.now() - time)))}ms`)

    invalidateModule(VirtualFiles.RESOLVED_STORIES_ID)
    invalidateModule(VirtualFiles.RESOLVED_SEARCH_TITLE_DATA_ID)
    invalidateModuleSilently(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)

    // Ordering guarantee: story-changed events are only announced once the
    // virtual modules above are invalidated, so any iframe reload they trigger
    // re-imports a freshly transformed preview runtime.
    for (const changedStory of changedStories) {
      server.ws.send(STORY_CHANGED_EVENT, changedStory)
    }
    await announce({ phase: 'completed', files })
  }

  /** Joins active work rather than executing two collection batches at once. */
  function collect(): Promise<void> {
    if (!isActive()) return Promise.resolve()
    if (activeCollection) return activeCollection
    activeCollection = (async () => {
      try {
        do {
          await runBatch()
        } while (queued && isActive())
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
