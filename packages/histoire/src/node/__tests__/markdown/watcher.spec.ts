import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { closeContext } from '../../context.js'
import { onMarkdownListChange } from '../../markdown/events.js'
import { createMarkdownFilesWatcher } from '../../markdown/watcher.js'
import { watchStories } from '../../stories.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('markdown watcher ownership', () => {
  it('keeps a failed edit unpublished and accepts the next valid filesystem edit', async () => {
    const project = await createMarkdownProject()
    const errors = vi.spyOn(console, 'error')
    try {
      await project.write('Original', 'Guide.story.md')
      await createMarkdownFilesWatcher(project.ctx)
      const file = project.ctx.markdownFiles[0]
      const completed: string[] = []
      onMarkdownListChange(project.ctx, () => {
        expect(file.html).toContain(file.content)
        completed.push(file.content!)
      })
      await project.write('[Missing](./Missing.story.md)', 'Guide.story.md')
      await vi.waitFor(() => expect(errors).toHaveBeenCalled())
      expect(String(errors.mock.calls[0][0])).toContain('[md] Cannot find story file')
      expect(file.content).toBe('Original')
      expect(completed).toEqual([])
      // Native change events within Chokidar's throttle window can coalesce.
      // Retry the real edit until admitted; a poisoned queue still cannot pass.
      await vi.waitFor(async () => {
        if (!completed.length) await project.write('Corrected', 'Guide.story.md')
        expect(completed).toEqual(['Corrected'])
      }, { interval: 100 })
      expect(file.html).toContain('Corrected')
    }
    finally {
      await project.close()
      errors.mockRestore()
    }
  })

  it('moves docs between standalone and physical stories as real files appear and disappear', async () => {
    const project = await createMarkdownProject()
    const stories = await watchStories(project.ctx)
    try {
      await stories.ready
      await project.write('# Guide', 'Guide.story.md')
      await createMarkdownFilesWatcher(project.ctx)
      const file = project.ctx.markdownFiles[0]
      const virtual = file.storyFile
      await project.write('<template />', 'Guide.story.vue')
      await vi.waitFor(() => expect(file.storyFile?.virtual).toBe(false))
      const physical = file.storyFile
      expect(physical.markdownFile).toBe(file)
      expect(project.ctx.storyFiles).toEqual([physical])
      expect(project.ctx.storyFiles).not.toContain(virtual)
      expect(file.html).toContain('Guide')
      await unlink(join(project.ctx.root, 'Guide.story.vue'))
      await vi.waitFor(() => expect(file.storyFile?.virtual).toBe(true))
      expect(physical.markdownFile).toBeUndefined()
      expect(project.ctx.storyFiles).toEqual([file.storyFile])
      expect(project.ctx.markdownFiles).toEqual([file])
    }
    finally {
      await stories.close()
      await project.close()
    }
  })

  it('cancels initial grammar preparation before any HTML or notifications are published', async () => {
    const project = await createMarkdownProject()
    const abort = new AbortController()
    const completed: unknown[] = []
    onMarkdownListChange(project.ctx, () => completed.push(project.ctx.markdownFiles[0]?.html))
    project.ctx.config.markdown = (md) => {
      md.core.ruler.push('cancel-initial-render', () => {
        queueMicrotask(() => abort.abort(new Error('startup cancelled')))
      })
    }
    try {
      await project.write('```js\nconst cancelled = true\n```', 'Guide.story.md')
      await expect(createMarkdownFilesWatcher(project.ctx, abort.signal)).rejects.toThrow('startup cancelled')
      await closeContext(project.ctx)
      expect(project.ctx.markdownFiles[0].html).toBeUndefined()
      expect(completed).toEqual([])
    }
    finally { await project.close() }
  })
})
