import type { Context } from '../context.js'
import chokidar from 'chokidar'
import micromatch from 'micromatch'
import { waitForRuntimeWork } from '../runtime/wait.js'
import { onStoryChange, onStoryListChange } from '../stories.js'
import { createMarkdownFileManager } from './files.js'
import { createMarkdownRendererWithPlugins } from './renderer.js'

/** Watches Markdown add/change/unlink using the same parser and renderer as builds. */
export async function createMarkdownFilesWatcher(ctx: Context, signal?: AbortSignal) {
  const manager = createMarkdownFileManager(ctx, await createMarkdownRendererWithPlugins(ctx))
  signal?.throwIfAborted()
  const watcher = chokidar.watch('.', {
    cwd: ctx.root,
    ignored: (path, stats) => {
      if (ctx.config.storyIgnored.some(pattern => micromatch.isMatch(path, pattern))) return true
      if (micromatch.isMatch(path, '**/*.story.md')) return false
      return stats?.isFile()
    },
  })
  let stopped = false
  let initialError: unknown
  let ready = false
  /** Avoids unhandled watcher callback failures while preserving initial scan rejection. */
  function handle(action: () => unknown) {
    if (stopped) return
    try {
      action()
    }
    catch (error) {
      if (!ready) initialError = error
      else console.error(error)
    }
  }
  const offStoryChange = onStoryChange((file) => {
    if (file) handle(manager.reconcile)
  })
  const offStoryList = onStoryListChange(() => handle(manager.reconcile))
  /** Drops module-global callbacks before closing the underlying watcher. */
  async function stop() {
    if (stopped) return
    stopped = true
    offStoryChange()
    offStoryList()
    await watcher.close()
  }
  watcher.on('add', file => handle(() => manager.update(file)))
    .on('change', file => handle(() => manager.update(file)))
    .on('unlink', file => handle(() => manager.remove(file)))
  try {
    await waitForRuntimeWork(new Promise<void>(resolve => watcher.once('ready', resolve)), signal)
    if (initialError) throw initialError
    manager.finishInitialScan()
    ready = true
    return { stop }
  }
  catch (error) {
    await stop()
    throw error
  }
}
