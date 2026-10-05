import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeContext } from '../../context.js'
import { createMarkdownPlugins } from '../../markdown/renderer.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createRuntimeContent } from '../../runtime/content/service.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('shared docs and source services', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it.each(['physical', 'virtual'])('reads transform-captured inline %s HTML without story import and detects source edits', async (kind) => {
    const original = '<docs lang="md"># Heading</docs>'
    const file = kind === 'physical' ? await fixture.physical(original, 'a.story.vue') : createMcpStory(fixture.root, 'virtual', 'virtual.story.vue')
    if (kind === 'virtual') file.moduleCode = original
    file.story.docsText = 'Heading'
    const ctx = createMcpContext(fixture.root, [file])
    const plugins = await createMarkdownPlugins(ctx)
    try {
      const transform = plugins[0].transform as (...args: any[]) => unknown
      await transform('# Heading', `${file.path}?vue&type=docs&lang.md`)
      const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
      await catalog.publish(ctx)
      const content = createRuntimeContent({ root: fixture.root, catalog })
      expect(await content.getDocs(file.story.id)).toMatchObject({ origin: 'inline', format: 'html', body: expect.stringContaining('<h1') })
      if (kind === 'physical') {
        await writeFile(file.path, '<template>changed</template>')
        await expect(content.getDocs(file.story.id)).rejects.toMatchObject({ code: 'STALE_REVISION' })
      }
      else { file.moduleCode = '<template>changed</template>' }
      const old = catalog.current.revision
      delete file.story.docsText
      await catalog.publish(ctx)
      expect(catalog.current.revision).not.toBe(old)
      await expect(content.getDocs(file.story.id)).rejects.toMatchObject({ code: 'DOCS_NOT_FOUND' })
    }
    finally { await closeContext(ctx) }
  })

  it('preserves existing transform output when synthetic source cannot be captured', async () => {
    const ctx = createMcpContext(fixture.root)
    try {
      const plugins = await createMarkdownPlugins(ctx)
      const transform = plugins[0].transform as (...args: any[]) => Promise<string>
      expect(await transform('# Synthetic', `${join(fixture.root, 'missing.vue')}?vue&type=docs&lang.md`)).toContain('Comp.doc =')
    }
    finally { await closeContext(ctx) }
  })

  it('publishes sibling Markdown changes/removal coherently and distinguishes empty docs', async () => {
    const file = await fixture.physical('source')
    const absolutePath = join(fixture.root, 'a.story.md')
    await writeFile(absolutePath, '# First\n')
    file.markdownFile = { id: 'docs', relativePath: 'a.story.md', absolutePath, isRelatedToStory: true, content: '# First\n', frontmatter: {}, html: '<h1>First</h1>' }
    const ctx = createMcpContext(fixture.root, [file])
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await catalog.publish(ctx)
    const content = createRuntimeContent({ root: fixture.root, catalog })
    expect(await content.getDocs(file.story.id)).toMatchObject({ origin: 'sibling', body: '<h1>First</h1>' })
    await writeFile(absolutePath, '')
    await expect(content.getDocs(file.story.id)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    file.markdownFile.content = ''
    file.markdownFile.html = ''
    await catalog.publish(ctx)
    expect(await content.getDocs(file.story.id)).toMatchObject({ format: 'html', body: '' })
    await unlink(absolutePath)
    delete file.markdownFile
    await catalog.publish(ctx)
    expect(catalog.current.catalog.stories[0].content.docs).toBe(false)
    await expect(content.getDocs(file.story.id)).rejects.toMatchObject({ code: 'DOCS_NOT_FOUND' })
  })
})
