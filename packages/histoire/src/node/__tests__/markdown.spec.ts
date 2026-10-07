import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMarkdownFilesWatcher } from '../markdown.js'
import { watchStories } from '../stories.js'
import { createMarkdownProject } from './utils/markdown-project.js'

describe('markdown', () => {
  let project: Awaited<ReturnType<typeof createMarkdownProject>>
  let storyWatcher: Awaited<ReturnType<typeof watchStories>>
  let markdownWatcher: Awaited<ReturnType<typeof createMarkdownFilesWatcher>> | undefined

  beforeEach(async () => {
    project = await createMarkdownProject()
    for (const file of ['test1.story.md', 'test2.story.md']) {
      await project.write(await readFile(path.resolve(__dirname, 'markdown', file), 'utf8'), file)
    }
    storyWatcher = await watchStories(project.ctx)
    await storyWatcher.ready
  })

  afterEach(async () => {
    await markdownWatcher?.stop()
    markdownWatcher = undefined
    await storyWatcher.close()
    await project.close()
  })

  it('renders both forward and backward links after discovering every target', async () => {
    markdownWatcher = await createMarkdownFilesWatcher(project.ctx)
    const { markdownFiles } = project.ctx
    expect(markdownFiles).toHaveLength(2)
    expect(markdownFiles.find(file => file.relativePath === 'test1.story.md').html).toContain('href="/story/test2-story-js"')
    expect(markdownFiles.find(file => file.relativePath === 'test2.story.md').html).toContain('href="/story/test1-story-js"')
  })

  it('rejects missing Markdown links during initial scan', async () => {
    await project.write('[Missing](./test4.story.md)', 'test3.story.md')
    await expect(createMarkdownFilesWatcher(project.ctx)).rejects.toThrow('[md] Cannot find story file')
  })

  it('updates standalone metadata and HTML in place, then removes its virtual story', async () => {
    await project.write('---\nid: original\ntitle: Original\n---\nFirst body\n', 'test3.story.md')
    markdownWatcher = await createMarkdownFilesWatcher(project.ctx)
    const file = project.ctx.markdownFiles.find(file => file.relativePath === 'test3.story.md')
    const story = file.storyFile
    await project.write('---\nid: changed\ntitle: Changed\n---\nSecond body\n', 'test3.story.md')
    await vi.waitFor(() => expect(file.content).toContain('Second body'))
    expect(file.html).toContain('Second body')
    expect(file.storyFile).toBe(story)
    expect(story.moduleCode).toContain('"id":"changed"')
    expect(story.moduleCode).toContain('"title":"Changed"')
    expect(project.ctx.markdownFiles.filter(file => file.relativePath === 'test3.story.md')).toHaveLength(1)
    expect(project.ctx.storyFiles.filter(file => file.relativePath === 'test3.story.js')).toHaveLength(1)
    await unlink(path.join(project.ctx.root, 'test3.story.md'))
    await vi.waitFor(() => expect(project.ctx.markdownFiles.includes(file)).toBe(false))
    expect(project.ctx.storyFiles.includes(story)).toBe(false)
  })
})
