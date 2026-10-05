import { deserialize, serialize } from 'node:v8'
import { describe, expect, it } from 'vitest'
import { closeContext } from '../../context.js'
import { createMarkdownRenderer } from '../../markdown/renderer.js'
import { createTestContextSnapshot } from '../../test/context-snapshot.js'
import { captureTestContextFiles, restoreTestContextFiles } from '../../test/context-transfer.js'
import { getTargetStoryFiles } from '../../test/targeting.js'
import { createMcpContext, createMcpStory } from '../utils/mcp/project.js'

describe('detached server test context', () => {
  it('keeps selected story/Markdown linkage detached across HMR while preserving plugin functions', () => {
    const selected = createMcpStory('/project', 'selected', 'selected.story.vue')
    const other = createMcpStory('/project', 'other', 'other.story.vue')
    const markdown = { id: 'docs', relativePath: 'selected.story.md', absolutePath: '/project/selected.story.md', isRelatedToStory: true, storyFile: selected, content: 'old docs', frontmatter: { nested: { title: 'original' } } }
    selected.markdownFile = markdown
    const ctx = createMcpContext('/project', [selected, other])
    ctx.markdownFiles = [markdown]
    const plugin = { name: 'custom', config: () => ({}) }
    ctx.config.plugins = [plugin]
    const captured = createTestContextSnapshot(ctx)
    selected.story!.title = 'new title'
    selected.story!.variants[0].title = 'new variant'
    markdown.content = 'new docs'
    markdown.frontmatter.nested.title = 'edited'
    selected.treePath!.push('edited')
    ctx.storyFiles = []
    expect(captured.storyFiles).toHaveLength(2)
    expect(getTargetStoryFiles(captured, { storyId: 'selected' })).toEqual([captured.storyFiles[0]])
    expect(captured.storyFiles[0].story!.title).toBe('A')
    expect(captured.storyFiles[0].story!.variants[0].title).toBe('Default')
    expect(captured.storyFiles[0].markdownFile!.content).toBe('old docs')
    expect(captured.storyFiles[0].treePath).toEqual(['Folder', 'A'])
    expect(captured.markdownFiles[0].frontmatter.nested.title).toBe('original')
    expect(captured.markdownFiles[0].storyFile).toBe(captured.storyFiles[0])
    expect(captured.config.plugins[0]).toBe(plugin)
    expect(captured.config).toBe(ctx.config)
  })

  it('retains neighboring physical and Markdown link targets during a selected story run', async () => {
    const selected = createMcpStory('/project', 'selected', 'Selected.story.vue')
    const other = createMcpStory('/project', 'other', 'Other.story.vue')
    const guide = createMcpStory('/project', 'guide', 'Guide.story.js')
    guide.virtual = true
    const markdown = { id: 'guide-docs', relativePath: 'Guide.story.md', absolutePath: '/project/Guide.story.md', isRelatedToStory: false, storyFile: guide }
    guide.markdownFile = markdown
    const ctx = createMcpContext('/project', [selected, other, guide])
    ctx.markdownFiles = [markdown]
    const captured = createTestContextSnapshot(ctx)
    const worker = createMcpContext('/project')
    restoreTestContextFiles(worker, deserialize(serialize(captureTestContextFiles(captured))))
    try {
      expect(worker.markdownFiles[0].storyFile).toBe(worker.storyFiles[2])
      expect(worker.storyFiles[2].markdownFile).toBe(worker.markdownFiles[0])
      const renderer = await createMarkdownRenderer(worker)
      const html = renderer.render('[Physical](./Other.story.vue) [Docs](./Guide.story.md)', { file: selected.path })
      expect(html).toContain('data-histoire-story-path="Other.story.vue"')
      expect(html).toContain('data-histoire-story-path="Guide.story.js"')
    }
    finally { await closeContext(worker) }
  })
})
