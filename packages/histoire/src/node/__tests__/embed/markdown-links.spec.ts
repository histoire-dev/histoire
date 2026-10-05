import { describe, expect, it } from 'vitest'
import { closeContext } from '../../context.js'
import { createMarkdownRenderer } from '../../markdown/renderer.js'
import { createMcpContext, createMcpStory } from '../utils/mcp/project.js'

describe('portable documentation story links', () => {
  it('retains exact file identity, structured variant query and local anchor before collection', async () => {
    const file = createMcpStory('/project', 'file-id', 'Custom story.js')
    file.story.id = 'custom:story'
    const context = createMcpContext('/project', [file])
    context.resolvedViteConfig.base = '/book/'
    try {
      const renderer = await createMarkdownRenderer(context)
      const html = renderer.render('[Anchor](./Custom%20story.js#part) [Variant](./Custom%20story.js?variantId=a%3Ab#part)', { file: '/project/Docs.story.md' })
      expect(html).toContain('href="/book/story/file-id#part"')
      expect(html).toContain('href="/book/story/file-id?variantId=a%3Ab#part"')
      expect(html).toContain('data-histoire-story-path="Custom story.js"')
    }
    finally { await closeContext(context) }
  })
})
