import type { Context } from '../context.js'
import chokidar from 'chokidar'
import micromatch from 'micromatch'
import { withCleanupDeadline } from '../runtime/cleanup.js'
import { getContextRegistry } from '../runtime/registry.js'
import { waitForRuntimeWork } from '../runtime/wait.js'
import { onStoryChange, onStoryListChange } from '../stories.js'
import { createStoryIgnore } from '../util/story-ignore.js'
import { createMarkdownFileManager } from './files.js'
import { assertMarkdownActive } from './highlighter.js'
import { createMarkdownRendererWithPlugins } from './renderer.js'

/** Watches Markdown through an ordered queue owned by this context generation. */
export async function createMarkdownFilesWatcher(ctx: Context, signal?: AbortSignal) {
  const md = await createMarkdownRendererWithPlugins(ctx)
  signal?.throwIfAborted()
  assertMarkdownActive(ctx)
  let stopped = false
  let ready = false
  let initialError: unknown
  let pending = Promise.resolve()
  let closing: Promise<void> | undefined
  const revisions = new Map<string, number>()
  /** Prevents late jobs from publishing after shutdown or startup cancellation. */
  function active() {
    return !stopped && !signal?.aborted && !getContextRegistry(ctx).cleanup.isClosing
  }
  const manager = createMarkdownFileManager(ctx, md, active)
  const isIgnored = createStoryIgnore(ctx)
  const watcher = chokidar.watch('.', {
    cwd: ctx.root,
    ignored: (path, stats) => {
      if (isIgnored(path)) return true
      if (micromatch.isMatch(path, '**/*.story.md')) return false
      return stats?.isFile()
    },
  })
  let rejectScan: (error: unknown) => void
  const scanned = new Promise<void>((resolve, reject) => {
    rejectScan = reject
    watcher.once('ready', resolve)
    watcher.once('error', reject)
  })
  void scanned.catch(() => {})

  /** Observes failures without poisoning subsequent watcher jobs. */
  function report(error: unknown) {
    if (!active()) return
    if (!ready) initialError ??= error
    else console.error(error)
  }
  /** Serializes updates, removals, association changes and initial rendering. */
  function enqueue(action: () => unknown | Promise<unknown>) {
    if (!active()) return
    pending = pending.then(async () => {
      if (active()) await action()
    }).catch(report)
  }
  /** Invalidates an in-flight edit when a newer event for its path is admitted. */
  function changed(file: string, removed = false) {
    if (!active() || !micromatch.isMatch(file, '**/*.story.md')) return
    const revision = (revisions.get(file) ?? 0) + 1
    revisions.set(file, revision)
    const current = () => active() && revisions.get(file) === revision
    enqueue(() => current() && (removed ? manager.remove(file) : manager.update(file, current)))
  }
  const offStoryChange = onStoryChange(ctx, (file) => {
    if (file) enqueue(manager.reconcile)
  })
  const offStoryList = onStoryListChange(ctx, () => enqueue(manager.reconcile))
  /** Closes admission and listeners before draining already owned asynchronous work. */
  function stop() {
    if (!closing) {
      stopped = true
      revisions.clear()
      offStoryChange()
      offStoryList()
      signal?.removeEventListener('abort', onAbort)
      rejectScan(new Error('Markdown watcher closed before initial scan'))
      closing = withCleanupDeadline(Promise.all([watcher.close(), pending]).then(() => {}))
    }
    return closing
  }
  /** Starts teardown immediately on cancellation; the owner observes its result. */
  function onAbort() {
    void stop().catch(() => {})
  }
  getContextRegistry(ctx).cleanup.add(stop)
  signal?.addEventListener('abort', onAbort, { once: true })
  watcher.on('add', file => changed(file))
    .on('change', file => changed(file))
    .on('unlink', file => changed(file, true))
    .on('error', report)
  try {
    await waitForRuntimeWork(scanned, signal)
    await pending
    if (initialError) throw initialError
    enqueue(manager.finishInitialScan)
    // Publication may enqueue a reconciliation, or another filesystem event
    // may arrive during grammar loading. Readiness includes that queued work.
    let drained: Promise<void>
    do {
      drained = pending
      await waitForRuntimeWork(drained, signal)
    } while (drained !== pending)
    if (initialError) throw initialError
    if (!active()) throw new Error('Project runtime closed')
    ready = true
    return { stop }
  }
  catch (error) {
    await stop()
    throw error
  }
}
