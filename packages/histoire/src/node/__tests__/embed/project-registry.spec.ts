import { describe, expect, it, vi } from 'vitest'
import { closeContext } from '../../context.js'
import { onMarkdownListChange } from '../../markdown/events.js'
import { createMarkdownFileManager } from '../../markdown/files.js'
import { createMarkdownRenderer } from '../../markdown/renderer.js'
import { addStory, notifyStoryChange, onStoryChange, removeStory } from '../../stories.js'
import { createMcpContext, createMcpProjectFixture } from '../utils/mcp/project.js'

/** Minimal story registration settings shared by physical and Markdown cases. */
function context(root: string) {
  const ctx = createMcpContext(root)
  ctx.config.supportMatch = [{ id: 'vanilla', patterns: ['**/*.js'], pluginIds: ['vanilla'] }]
  return ctx
}

describe('project-owned registry events', () => {
  it('registers repeated relative paths and notifies only matching context', () => {
    const first = context('/first')
    const second = context('/second')
    const one = vi.fn()
    const two = vi.fn()
    const off = onStoryChange(first, one)
    onStoryChange(second, two)
    const file = addStory(first, 'same.story.js')
    const other = addStory(second, 'same.story.js')
    notifyStoryChange(first, file)
    expect(one).toHaveBeenCalledWith(file)
    expect(two).not.toHaveBeenCalled()
    expect(other.path).toBe('/second/same.story.js')
    removeStory(first, file.relativePath)
    expect(first.storyFiles).toHaveLength(0)
    expect(second.storyFiles).toEqual([other])
    off()
    notifyStoryChange(first, file)
    expect(one).toHaveBeenCalledOnce()
  })

  it('creates and removes standalone Markdown without touching another inventory', async () => {
    const fixture = await createMcpProjectFixture()
    const first = context(fixture.root)
    try {
      await fixture.physical('# Documentation', 'Guide.story.md')
      const second = context('/independent')
      const own = vi.fn()
      const other = vi.fn()
      onMarkdownListChange(first, own)
      onMarkdownListChange(second, other)
      const manager = createMarkdownFileManager(first, await createMarkdownRenderer(first))
      manager.update('Guide.story.md')
      manager.finishInitialScan()
      expect(first.storyFiles[0].virtual).toBe(true)
      expect(first.markdownFiles[0].html).toContain('Documentation')
      manager.remove('Guide.story.md')
      expect(first.storyFiles).toHaveLength(0)
      expect(first.markdownFiles).toHaveLength(0)
      expect(second.storyFiles).toHaveLength(0)
      expect(own).toHaveBeenCalledTimes(2)
      expect(other).not.toHaveBeenCalled()
    }
    finally {
      await closeContext(first)
      await fixture.close()
    }
  })

  it('keeps absolute generated stories project-relative for catalog and build consumers', () => {
    const ctx = context('/project')
    const generated = addStory(ctx, '/project/.histoire/tmp/plugins/Tailwind.story.js')
    expect(generated.path).toBe('/project/.histoire/tmp/plugins/Tailwind.story.js')
    expect(generated.relativePath).toBe('.histoire/tmp/plugins/Tailwind.story.js')
    expect(addStory(ctx, '.histoire/tmp/plugins/Tailwind.story.js')).toBe(generated)
    removeStory(ctx, generated.relativePath)
    expect(ctx.storyFiles).toHaveLength(0)
  })
})
