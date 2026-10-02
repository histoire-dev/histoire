import { describe, expect, it } from 'vitest'
import { createTestContextSnapshot } from '../../test/context-snapshot.js'
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
    const captured = createTestContextSnapshot(ctx, 'selected')
    selected.story!.title = 'new title'
    selected.story!.variants[0].title = 'new variant'
    markdown.content = 'new docs'
    markdown.frontmatter.nested.title = 'edited'
    selected.treePath!.push('edited')
    ctx.storyFiles = []
    expect(captured.storyFiles).toHaveLength(1)
    expect(captured.storyFiles[0].story!.title).toBe('A')
    expect(captured.storyFiles[0].story!.variants[0].title).toBe('Default')
    expect(captured.storyFiles[0].markdownFile!.content).toBe('old docs')
    expect(captured.storyFiles[0].treePath).toEqual(['Folder', 'A'])
    expect(captured.markdownFiles[0].frontmatter.nested.title).toBe('original')
    expect(captured.markdownFiles[0].storyFile).toBe(captured.storyFiles[0])
    expect(captured.config.plugins[0]).toBe(plugin)
    expect(captured.config).toBe(ctx.config)
  })
})
