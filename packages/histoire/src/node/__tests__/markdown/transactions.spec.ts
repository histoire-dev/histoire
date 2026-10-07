import { describe, expect, it } from 'vitest'
import { onMarkdownListChange } from '../../markdown/events.js'
import { createMarkdownFileManager } from '../../markdown/files.js'
import { createMarkdownRenderer } from '../../markdown/renderer.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('markdown completed publication', () => {
  it('retains last complete document and virtual story after an invalid edit, then accepts a correction', async () => {
    const project = await createMarkdownProject()
    try {
      await project.write('---\nid: original\ntitle: Original\n---\nFirst body', 'Guide.story.md')
      const manager = createMarkdownFileManager(project.ctx, await createMarkdownRenderer(project.ctx))
      const file = await manager.update('Guide.story.md')
      await manager.finishInitialScan()
      const story = file.storyFile!
      const originalHtml = file.html
      const originalModule = story.moduleCode
      await project.write('---\nid: broken\ntitle: Broken\n---\n[Missing](./Missing.story.md)', 'Guide.story.md')
      await expect(manager.update('Guide.story.md')).rejects.toThrow('[md] Cannot find story file')
      expect(file.content).toBe('First body')
      expect(file.frontmatter).toEqual({ id: 'original', title: 'Original' })
      expect(file.html).toBe(originalHtml)
      expect(story.moduleCode).toBe(originalModule)
      expect(file.storyFile).toBe(story)
      expect(project.ctx.storyFiles).toEqual([story])

      await project.write('---\nid: corrected\ntitle: Corrected\n---\nFinal body', 'Guide.story.md')
      await manager.update('Guide.story.md')
      expect(file.content).toBe('Final body')
      expect(file.html).toContain('Final body')
      expect(story.moduleCode).toContain('"id":"corrected"')
      expect(file.storyFile).toBe(story)
    }
    finally { await project.close() }
  })

  it('skips superseded preparation and cannot resurrect a removed document', async () => {
    const project = await createMarkdownProject()
    try {
      await project.write('Original', 'Guide.story.md')
      const manager = createMarkdownFileManager(project.ctx, await createMarkdownRenderer(project.ctx))
      const file = await manager.update('Guide.story.md')
      await manager.finishInitialScan()
      const published: string[] = []
      onMarkdownListChange(project.ctx, () => published.push(file.content!))
      await project.write('```ts\nconst stale = true\n```', 'Guide.story.md')
      let current = true
      const stale = manager.update('Guide.story.md', () => current)
      current = false
      await stale
      expect(file.content).toBe('Original')
      expect(published).toEqual([])
      await project.write('Final', 'Guide.story.md')
      await manager.update('Guide.story.md')
      expect(published).toEqual(['Final'])
      current = true
      const removed = manager.update('Guide.story.md', () => current)
      current = false
      manager.remove('Guide.story.md')
      await removed
      expect(project.ctx.markdownFiles).toEqual([])
      expect(project.ctx.storyFiles).toEqual([])
    }
    finally { await project.close() }
  })

  it('rejects an unknown grammar without publishing and recovers with a known grammar', async () => {
    const project = await createMarkdownProject()
    try {
      const manager = createMarkdownFileManager(project.ctx, await createMarkdownRenderer(project.ctx))
      await manager.finishInitialScan()
      await project.write('```not-a-real-grammar\ninvalid\n```', 'New.story.md')
      await expect(manager.update('New.story.md')).rejects.toThrow('not found')
      expect(project.ctx.markdownFiles).toEqual([])
      expect(project.ctx.storyFiles).toEqual([])
      await project.write('```js\nconst valid = true\n```', 'New.story.md')
      const file = await manager.update('New.story.md')
      expect(file.html).toContain('valid')
      expect(project.ctx.storyFiles).toEqual([file.storyFile])
    }
    finally { await project.close() }
  })
})
