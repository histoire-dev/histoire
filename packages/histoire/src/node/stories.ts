import type { ServerStoryFile } from '@histoire/shared'
import type { Context } from './context.js'
import { kebabCase } from 'change-case'
import chokidar from 'chokidar'
import { globby } from 'globby'
import micromatch from 'micromatch'
import { basename, resolve } from 'pathe'

type StoryChangeHandler = (file?: ServerStoryFile) => unknown
const storyChangeHandlers: StoryChangeHandler[] = []

/**
 * Called when a new story is added or modified. Collecting should be done.
 *
 * The handler list is module-global and outlives a dev server, so the returned
 * disposer must be called when the listening server closes — otherwise every
 * config-change restart stacks another live collector on the same events.
 * @param handler
 * @returns Removes the handler.
 */
export function onStoryChange(handler: StoryChangeHandler) {
  storyChangeHandlers.push(handler)
  return () => removeHandler(storyChangeHandlers, handler)
}

/** Removes a registered handler from its list. */
function removeHandler<T>(handlers: T[], handler: T) {
  const index = handlers.indexOf(handler)
  if (index !== -1) {
    handlers.splice(index, 1)
  }
}

export function notifyStoryChange(file?: ServerStoryFile) {
  for (const handler of storyChangeHandlers) {
    handler(file)
  }
}

type StoryListChangeHandler = () => unknown
const storyListChangeHandlers: StoryListChangeHandler[] = []

/**
 * Called when the story list has changed (ex: removed a story). No collecting should be needed.
 * @param handler
 * @returns Removes the handler (see {@link onStoryChange}).
 */
export function onStoryListChange(handler: StoryListChangeHandler) {
  storyListChangeHandlers.push(handler)
  return () => removeHandler(storyListChangeHandlers, handler)
}

export function notifyStoryListChange() {
  for (const handler of storyListChangeHandlers) {
    handler()
  }
}

let context: Context

export async function watchStories(newContext: Context) {
  context = newContext

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

  watcher
    .on('add', (file) => {
      const storyFile = addStory(file)
      setTimeout(() => notifyStoryChange(storyFile), 100) // Delay in case file renaming fired Add event before Unlink event
    })
    .on('unlink', (file) => {
      removeStory(file)
      notifyStoryListChange()
    })

  return watcher
}

function getAbsoluteFilePath(relativeFilePath: string) {
  return resolve(context.root, relativeFilePath)
}

export function addStory(relativeFilePath: string, virtualModuleCode?: string) {
  const absoluteFilePath = getAbsoluteFilePath(relativeFilePath)

  for (const file of context.storyFiles) {
    if (file.path === absoluteFilePath) {
      return file
    }
  }

  const fileId = kebabCase(relativeFilePath.toLowerCase())
  let fileName = basename(relativeFilePath)
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
    relativePath: relativeFilePath,
    fileName,
    moduleId: virtualModuleCode ? `virtual:story:${absoluteFilePath}` : absoluteFilePath,
    supportPluginId,
    virtual: !!virtualModuleCode,
    moduleCode: virtualModuleCode,
  }
  context.storyFiles.push(file)
  return file
}

export function removeStory(relativeFilePath: string) {
  const absoluteFilePath = getAbsoluteFilePath(relativeFilePath)
  const index = context.storyFiles.findIndex(file => file.path === absoluteFilePath)
  if (index !== -1) context.storyFiles.splice(index, 1)
}

export async function findAllStories(newContext: Context) {
  context = newContext

  const files = await globby(context.config.storyMatch, {
    cwd: context.root,
    ignore: context.config.storyIgnored,
  })
  context.storyFiles.length = 0
  for (const file of files) {
    addStory(file)
  }
}
