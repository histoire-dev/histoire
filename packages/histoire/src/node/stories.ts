import { Context } from './context.js'
import chokidar from 'chokidar'
import { globby } from 'globby'
import Case from 'case'
import { join } from 'pathe'

export interface Story {
  id: string
  path: string
}

export const stories: Story[] = []

const handlers: (() => unknown)[] = []

let context: Context

export function onStoryChange (handler: () => unknown) {
  handlers.push(handler)
}

export async function watchStories (newContext: Context) {
  context = newContext

  const watcher = chokidar.watch(context.config.storyMatch, {
    cwd: context.config.sourceDir,
  })

  watcher.on('add', (file) => {
    addStory(file)
    notifyChange()
  })

  watcher.on('unlink', (file) => {
    stories.splice(stories.findIndex((story) => story.path === file), 1)
    notifyChange()
  })

  return watcher
}

function notifyChange () {
  for (const handler of handlers) {
    handler()
  }
}

function getAbsoluteFilePath (relativeFilePath: string) {
  return join(context.config.sourceDir, relativeFilePath)
}

function addStory (relativeFilePath: string) {
  const absoluteFilePath = getAbsoluteFilePath(relativeFilePath)
  const fileId = Case.kebab(relativeFilePath)

  stories.push({
    id: fileId,
    path: absoluteFilePath,
  })
}

export async function findStories () {
  const files = await globby(context.config.storyMatch, {
    cwd: context.config.sourceDir,
  })
  stories.splice(0, stories.length)
  for (const file of files) {
    addStory(file)
  }
}
