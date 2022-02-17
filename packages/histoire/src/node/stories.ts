import chokidar from 'chokidar'
import { globby } from 'globby'
import Case from 'case'
import { join } from 'pathe'
import { Context } from './context.js'
import type { StoryFile } from './types.js'

type StoryChangeHandler = (file?: StoryFile) => unknown
const handlers: StoryChangeHandler[] = []

let context: Context

export function onStoryChange (handler: StoryChangeHandler) {
  handlers.push(handler)
}

export async function watchStories (newContext: Context) {
  context = newContext

  const watcher = chokidar.watch(context.config.storyMatch, {
    cwd: context.root,
  })

  watcher
    .on('add', (file) => {
      const storyFile = addStory(file)
      setTimeout(() => notifyStoryChange(storyFile), 100) // Delay in case file renaming fired Add event before Unlink event
    })
    .on('unlink', (file) => {
      removeStory(file)
      notifyStoryChange()
    })

  return watcher
}

export function notifyStoryChange (file?: StoryFile) {
  for (const handler of handlers) {
    handler(file)
  }
}

function getAbsoluteFilePath (relativeFilePath: string) {
  return join(context.root, relativeFilePath)
}

function addStory (relativeFilePath: string) {
  const absoluteFilePath = getAbsoluteFilePath(relativeFilePath)
  const fileId = Case.kebab(relativeFilePath)

  const file: StoryFile = {
    id: fileId,
    path: absoluteFilePath,
    moduleId: `/${relativeFilePath}`,
  }
  context.storyFiles.push(file)
  return file
}

function removeStory (relativeFilePath: string) {
  const fileId = Case.kebab(relativeFilePath)
  const index = context.storyFiles.findIndex((file) => file.id === fileId)
  if (index !== -1) context.storyFiles.splice(index, 1)
}

export async function findAllStories (newContext: Context) {
  context = newContext

  const files = await globby(context.config.storyMatch, {
    cwd: context.root,
  })
  context.storyFiles.length = 0
  for (const file of files) {
    addStory(file)
  }
}
