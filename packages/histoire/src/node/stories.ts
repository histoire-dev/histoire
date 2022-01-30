import { Context } from './context.js'
import chokidar from 'chokidar'
import { globby } from 'globby'
import Case from 'case'

export interface Story {
  id: string
  file: string
}

export const stories: Story[] = []

const handlers: (() => unknown)[] = []

export function onStoryChange (handler: () => unknown) {
  handlers.push(handler)
}

export async function watchStories (ctx: Context) {
  const watcher = chokidar.watch(ctx.config.storyMatch, {
    cwd: ctx.config.sourceDir,
  })
  watcher.on('add', (file) => {
    addStory(file)
    notifyChange()
  })
  watcher.on('unlink', (file) => {
    stories.splice(stories.findIndex((story) => story.file === file), 1)
    notifyChange()
  })
  return watcher
}

function notifyChange () {
  for (const handler of handlers) {
    handler()
  }
}

function addStory (file: string) {
  stories.push({
    id: Case.kebab(file),
    file,
  })
}

export async function findStories (ctx: Context) {
  const files = await globby(ctx.config.storyMatch, {
    cwd: ctx.config.sourceDir,
  })
  stories.splice(0, stories.length)
  for (const file of files) {
    addStory(file)
  }
}
