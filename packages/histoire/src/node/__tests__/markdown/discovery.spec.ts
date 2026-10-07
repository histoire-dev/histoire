import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMarkdownFilesWatcher } from '../../markdown/watcher.js'
import { findAllStories, watchStories } from '../../stories.js'
import { createStoryIgnore } from '../../util/story-ignore.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('project source discovery', () => {
  it('skips owned run outputs while retaining neighboring authored stories and docs', async () => {
    const project = await createMarkdownProject()
    project.ctx.config.storyIgnored = []
    project.ctx.config.storyMatch.push('.histoire/**/*.story.vue')
    try {
      for (const directory of ['.histoire/tmp/dev/old-run', '.histoire/tmp-sources']) {
        await mkdir(join(project.ctx.root, directory), { recursive: true })
        await project.write('<template />', `${directory}/Example.story.vue`)
        await project.write('# Docs', `${directory}/Example.story.md`)
      }
      await project.write('<template />', 'Authored.story.vue')
      await project.write('# Authored', 'Authored.story.md')
      const expected = ['.histoire/tmp-sources/Example.story.vue', 'Authored.story.vue']
      const isIgnored = createStoryIgnore(project.ctx)
      expect(isIgnored('.histoire/tmp/dev/old-run/Example.story.md')).toBe(true)
      expect(isIgnored('.histoire/tmp-sources/Example.story.md')).toBe(false)
      await findAllStories(project.ctx)
      expect(project.ctx.storyFiles.map(file => file.relativePath).sort()).toEqual(expected)
      project.ctx.storyFiles.length = 0
      const stories = await watchStories(project.ctx)
      try {
        await stories.ready
        await createMarkdownFilesWatcher(project.ctx)
        expect(project.ctx.storyFiles.map(file => file.relativePath).sort()).toEqual(expected)
        // Markdown discovery retains its existing exclusion of hidden docs.
        expect(project.ctx.markdownFiles.map(file => file.relativePath)).toEqual(['Authored.story.md'])
        const watched = Object.keys(stories.getWatched())
        expect(watched.some(directory => directory === '.histoire/tmp' || directory.startsWith('.histoire/tmp/'))).toBe(false)
        expect(project.ctx.markdownFiles.every(file => file.html?.includes('<h1'))).toBe(true)
      }
      finally { await stories.close() }
    }
    finally { await project.close() }
  })
})
