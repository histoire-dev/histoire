import { Context } from './context.js'
import chokidar from 'chokidar'
import { globby } from 'globby'
import Case from 'case'
import { join } from 'pathe'

export interface Story {
  id: string
  path: string
}

export let stories: Record<string, Story> = {}

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

  watcher
    .on('add', (file) => {
      addStory(file)
      notifyChange()
      setTimeout(notifyChange, 100) // Delay in case file renaming fired Add event before Unlink event
    })
    .on('unlink', (file) => {
      removeStory(file)
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

  stories[fileId] = {
    id: fileId,
    path: absoluteFilePath,
  }
}

function removeStory (relativeFilePath: string) {
  const fileId = Case.kebab(relativeFilePath)
  delete stories[fileId]
}

export async function findStories (newContext: Context) {
  context = newContext

  const files = await globby(context.config.storyMatch, {
    cwd: context.config.sourceDir,
  })
  stories = {}
  for (const file of files) {
    addStory(file)
  }
}
