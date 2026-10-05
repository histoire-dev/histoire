import type { Context } from '../context.js'
import { createWriteStream, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeContext, createContext } from '../context.js'
import { createMarkdownFilesWatcher } from '../markdown.js'
import { watchStories } from '../stories.js'

describe('markdown', async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(path.resolve(__dirname, './markdown'))

  let ctx: Context
  let storyWatcher: Awaited<ReturnType<typeof watchStories>>
  let markdownWatcher: Awaited<ReturnType<typeof createMarkdownFilesWatcher>> | undefined
  const missingStoryFile = path.resolve(__dirname, './markdown/test3.story.md')

  beforeEach(async () => {
    ctx = await createContext({
      mode: 'dev',
    })

    // create watch stories to set context root etc.
    storyWatcher = await watchStories(ctx)
  })

  afterEach(async () => {
    if (markdownWatcher) {
      await markdownWatcher.stop()
      markdownWatcher = undefined
    }
    await storyWatcher.close()
    await closeContext(ctx)

    if (existsSync(missingStoryFile)) {
      unlinkSync(missingStoryFile)
    }
  })

  it('should not throw error or depend on - resolve order for linking', async () => {
    // FileWatcher should pickup the test markdown files (test1 and test2)
    // test1 links to test2 (issue previously as test1 resolved first)
    // test 2 links to test1
    markdownWatcher = await createMarkdownFilesWatcher(ctx)
    expect(ctx.markdownFiles.length).toEqual(2)
  })

  it('should render html from md', async () => {
    markdownWatcher = await createMarkdownFilesWatcher(ctx)
    expect(ctx.markdownFiles[0].html).toContain('<p>')
  })

  it('should throw error on missing [md] story file.', async () => {
    const writer = createWriteStream(missingStoryFile)
    // link to missing file.
    writer.write(
      '<!-- File should link to test1 file. -->\n'
      + '# Test3\n\n'
      + 'Link to test 4\n'
      + '[TEST](./test4.story.md)\n',
    )
    writer.end()
    await new Promise(resolve => writer.on('finish', resolve))

    // create markdownWatcher and check for error
    await expect(createMarkdownFilesWatcher(ctx)).rejects.toThrowError()
  })

  it('updates standalone frontmatter, HTML and virtual module without duplicate records', async () => {
    writeFileSync(missingStoryFile, '---\nid: original\ntitle: Original\n---\nFirst body\n')
    markdownWatcher = await createMarkdownFilesWatcher(ctx)
    const file = ctx.markdownFiles.find(file => file.absolutePath === missingStoryFile)
    const story = file.storyFile
    writeFileSync(missingStoryFile, '---\nid: changed\ntitle: Changed\n---\nSecond body\n')
    await vi.waitFor(() => expect(file.content).toContain('Second body'))
    expect(file.html).toContain('Second body')
    expect(file.storyFile).toBe(story)
    expect(story.moduleCode).toContain('"id":"changed"')
    expect(story.moduleCode).toContain('"title":"Changed"')
    expect(ctx.markdownFiles.filter(file => file.absolutePath === missingStoryFile)).toHaveLength(1)
    expect(ctx.storyFiles.filter(file => file.relativePath === 'test3.story.js')).toHaveLength(1)
    unlinkSync(missingStoryFile)
    await vi.waitFor(() => expect(ctx.markdownFiles.includes(file)).toBe(false))
    expect(ctx.storyFiles.includes(story)).toBe(false)
  })
})
