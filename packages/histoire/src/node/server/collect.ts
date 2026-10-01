import type { HistoireStoryChangedPayload, ServerStoryFile } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { useCollectStories } from '../collect/index.js'
import type { Context } from '../context.js'
import { performance } from 'node:perf_hooks'
import { STORY_CHANGED_EVENT } from '@histoire/shared'
import pc from 'picocolors'
import { onStoryChange } from '../stories.js'
import { fileHasVitestMocks } from '../util/story-vitest.js'
import * as VirtualFiles from '../virtual/index.js'

export interface StoryCollectorOptions {
  ctx: Context
  /** Client-facing Vite dev server, used to push progress/HMR messages. */
  server: ViteDevServer
  /** Story executor + cache control bound to the node-side collection server. */
  collectStories: Pick<ReturnType<typeof useCollectStories>, 'clearCache' | 'executeStoryFile'>
  invalidateModule: (id: string) => void
  invalidateModuleSilently: (id: string) => void
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

  const offStoryChange = onStoryChange(async (changedFile) => {
    if (changedFile && !didAllStoriesYet) {
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
      if (!collecting) {
        clearTimeout(queueTimer)
        // Debounce
        queueTimer = setTimeout(collect, 100)
      }
      else if (!changedFile && !currentFiles.length) {
        // Full collect in progress
        queued = false
      }
    }
  })

  async function collect() {
    collecting = true

    clearCache()

    currentFiles = queuedFiles.slice()
    queuedFiles = []
    queued = false

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
        await executeStoryFile(storyFile)
        if (storyFile.story) {
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
        server.ws.send('histoire:stories-loading-progress', {
          loadedFileCount: loadedFilesCount,
          totalFileCount: fileCount,
        })
      }

      sendProgress()

      await Promise.all(ctx.storyFiles.map(async (storyFile) => {
        await executeStoryFile(storyFile)
        loadedFilesCount++
        sendProgress()
      }))

      didAllStoriesYet = true
      server.ws.send('histoire:all-stories-loaded', {})
    }
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

    collecting = false

    if (queued) {
      await collect()
    }
  }

  /**
   * Stops the collection loop: drops the story listener and cancels a debounce
   * still pending, which would otherwise collect into a closed dev server.
   */
  function stop() {
    clearTimeout(queueTimer)
    offStoryChange()
  }

  return {
    collect,
    stop,
  }
}
