import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from './context.js'
import { kebabCase } from 'change-case'
import chokidar from 'chokidar'
import { globby } from 'globby'
import micromatch from 'micromatch'
import { basename, relative, resolve } from 'pathe'
import { getContextRegistry } from './runtime/registry.js'

/** Registers collection feedback for one captured project context. */
export function onStoryChange(ctx: Context, handler: (file?: ServerStoryFile) => unknown) {
  return getContextRegistry(ctx).events.on('storyChanged', handler)
}

/** Requests collection without notifying another project's listeners. */
export function notifyStoryChange(ctx: Context, file?: ServerStoryFile) {
  getContextRegistry(ctx).events.emit('storyChanged', file)
}

/** Registers inventory changes owned by one project. */
export function onStoryListChange(ctx: Context, handler: () => unknown) {
  return getContextRegistry(ctx).events.on('storyListChanged', handler)
}

/** Announces structural changes to the captured project inventory. */
export function notifyStoryListChange(ctx: Context) {
  getContextRegistry(ctx).events.emit('storyListChanged', undefined)
}

/** Watches one project and exposes completion of its initial filesystem scan. */
export async function watchStories(context: Context) {
  const registry = getContextRegistry(context)
  if (registry.storyWatcher) throw new Error('A story watcher already owns this context')

  const baseWatchPaths = Array.from(new Set(context.config.storyMatch.map((pattern) => {
    const segments = pattern.split('/')
    return segments.slice(0, segments.findIndex(segment => segment.includes('*'))).join('/') || '.'
  })))

  const resolvedStoryIgnored = context.config.storyIgnored.map((pattern) => {
    return resolve(context.root, pattern)
  })

  const resolveStoryMatch = context.config.storyMatch.map((pattern) => {
    return resolve(context.root, pattern)
  })

  /** Recheck event paths because rename/unlink notifications can lack scan stats. */
  function matchesStory(file: string): boolean {
    const absolute = getAbsoluteFilePath(context, file)
    return !resolvedStoryIgnored.some(pattern => micromatch.isMatch(absolute, pattern))
      && resolveStoryMatch.some(pattern => micromatch.isMatch(absolute, pattern))
  }

  const watcher = chokidar.watch(baseWatchPaths, {
    cwd: context.root,
    ignored: (path, stats) => {
      if (resolvedStoryIgnored.some(pattern => micromatch.isMatch(path, pattern))) {
        return true
      }
      if (resolveStoryMatch.some(pattern => micromatch.isMatch(path, pattern))) {
        return false
      }

      // Allow directories to be traversed, only ignore files that don't match
      return stats?.isFile() ?? false
    },
  })
  registry.storyWatcher = watcher

  const delayedChanges = new Set<ReturnType<typeof setTimeout>>()
  let stopped = false
  let readySettled = false
  let rejectReady: (error: unknown) => void
  const ready = new Promise<void>((resolveReady, reject) => {
    rejectReady = reject
    watcher.once('ready', () => {
      readySettled = true
      resolveReady()
    })
    watcher.on('error', (error) => {
      if (!readySettled) reject(error)
      else if (!stopped) console.error(error)
    })
  })
  // A caller may close during startup before it begins awaiting readiness.
  void ready.catch(() => {})
  watcher
    .on('add', (file) => {
      if (stopped || !matchesStory(file)) return
      try {
        const storyFile = addStory(context, file)
        const timer = setTimeout(() => {
          delayedChanges.delete(timer)
          if (!stopped) notifyStoryChange(context, storyFile)
        }, 100) // Delay in case file renaming fired Add event before Unlink event
        delayedChanges.add(timer)
      }
      catch (error) {
        if (!readySettled) rejectReady(error)
        else console.error(error)
      }
    })
    .on('unlink', (file) => {
      if (stopped) return
      // Optimizer temp files share watched directories. Only removal of an
      // actual physical story changes catalog membership or requires a scan.
      const absolute = getAbsoluteFilePath(context, file)
      if (!context.storyFiles.some(story => story.path === absolute && !story.virtual)) return
      removeStory(context, file)
      notifyStoryListChange(context)
    })

  const originalClose = watcher.close.bind(watcher)
  let closing: Promise<void>
  watcher.close = () => {
    if (!closing) {
      stopped = true
      for (const timer of delayedChanges) clearTimeout(timer)
      delayedChanges.clear()
      if (!readySettled) rejectReady(new Error('Story watcher closed before initial scan'))
      closing = originalClose().finally(() => {
        if (registry.storyWatcher === watcher) registry.storyWatcher = undefined
      })
    }
    return closing
  }
  return Object.assign(watcher, { ready })
}

/** Resolves a registered project-relative story path. */
function getAbsoluteFilePath(context: Context, relativeFilePath: string) {
  return resolve(context.root, relativeFilePath)
}

/** Registers one physical or generated story without duplicating its path. */
export function addStory(context: Context, relativeFilePath: string, virtualModuleCode?: string) {
  const absoluteFilePath = getAbsoluteFilePath(context, relativeFilePath)
  // Plugin output paths are absolute after project isolation. Keep the actual
  // loader path while publishing a root-relative inventory/build label.
  const relativePath = relative(context.root, absoluteFilePath)

  for (const file of context.storyFiles) {
    if (file.path === absoluteFilePath) {
      return file
    }
  }

  const fileId = kebabCase(relativePath.toLowerCase())
  let fileName = basename(relativePath)
  if (fileName.includes('.')) {
    fileName = fileName.substring(0, fileName.indexOf('.'))
  }

  let supportPluginId: string

  for (const p of context.config.supportMatch) {
    if (micromatch.isMatch(absoluteFilePath, p.patterns, {
      dot: true,
    })) {
      supportPluginId = p.pluginIds[0]
      break
    }
  }

  if (!supportPluginId) {
    throw new Error(`No support plugin found for file ${absoluteFilePath}`)
  }

  const file: ServerStoryFile = {
    id: fileId, // The file id will be changed by the story id after it is collected
    path: absoluteFilePath,
    relativePath,
    fileName,
    moduleId: virtualModuleCode ? `virtual:story:${absoluteFilePath}` : absoluteFilePath,
    supportPluginId,
    virtual: !!virtualModuleCode,
    moduleCode: virtualModuleCode,
  }
  context.storyFiles.push(file)
  return file
}

/** Removes a registered story using its project-relative path. */
export function removeStory(context: Context, relativeFilePath: string) {
  const absoluteFilePath = getAbsoluteFilePath(context, relativeFilePath)
  const index = context.storyFiles.findIndex(file => file.path === absoluteFilePath)
  if (index !== -1) context.storyFiles.splice(index, 1)
}

/** Scans a project once; does not replace another live watcher's context. */
export async function findAllStories(context: Context) {
  const files = await globby(context.config.storyMatch, {
    cwd: context.root,
    ignore: context.config.storyIgnored,
  })
  context.storyFiles.length = 0
  for (const file of files) {
    addStory(context, file)
  }
}
