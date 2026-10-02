import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectCatalog } from '../../mcp/project/catalog.js'
import { hashContent } from '../../mcp/project/content-index.js'
import { createProjectContent } from '../../mcp/project/content.js'
import { pageSourceText } from '../../mcp/project/source-pages.js'
import { pageDocsText } from '../../mcp/project/text-pages.js'
import { getResolvedStorySourceId, storySource } from '../../virtual/story-source.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('registered documentation and source', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  /** Publishes one immutable story and exposes its content facade. */
  async function service(file = createMcpStory(fixture.root)) {
    const catalog = createProjectCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    await catalog.publish(createMcpContext(fixture.root, [file]))
    return { catalog, content: createProjectContent({ root: fixture.root, catalog }), file }
  }

  it.each(['vue', 'svelte'])('returns exact physical %s source and preserves existing Source panel export', async (extension) => {
    const text = '\uFEFF<script>const word = "🐈"</script>\r\n<template/>\n'
    const file = await fixture.physical(text, `a.story.${extension}`)
    const { content } = await service(file)
    expect(await content.getSource({ storyId: file.story.id })).toMatchObject({ kind: 'file', text, totalLines: 2, startLine: 1, endLine: 2, sha256: hashContent(text) })
    expect(await storySource(createMcpContext(fixture.root, [file]), getResolvedStorySourceId(file.story.id))).toBe(`export default ${JSON.stringify(text)}`)
  })

  it('labels generated virtual source and preserves the existing virtual Source panel', async () => {
    const { content, file } = await service()
    expect(await content.getSource({ storyId: file.story.id })).toMatchObject({ kind: 'virtual', text: file.moduleCode })
    expect(await storySource(createMcpContext(fixture.root, [file]), getResolvedStorySourceId(file.story.id))).toBe(`export default ${JSON.stringify(file.moduleCode)}`)
  })

  it.each([true, false])('prefers registered Markdown over collected docs and retains association %s', async (related) => {
    const file = createMcpStory(fixture.root)
    file.story.docsText = 'inline'
    const markdownPath = join(fixture.root, 'a.story.md')
    await writeFile(markdownPath, '---\ntitle: Docs\n---\n# Markdown\n')
    file.markdownFile = { id: 'docs', relativePath: 'a.story.md', absolutePath: markdownPath, isRelatedToStory: related, content: '# Markdown\n', frontmatter: { title: 'Docs' } }
    const { content } = await service(file)
    expect(await content.getDocs({ storyId: file.story.id })).toMatchObject({ text: '# Markdown\n', kind: 'markdown', origin: related ? 'sibling' : 'standalone', filePath: 'a.story.md' })
    await writeFile(markdownPath, '---\ntitle: Changed\n---\n# Markdown\n')
    await expect(content.getDocs({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
  })

  it('distinguishes empty collected docs from absent docs and captures collected text immutably', async () => {
    const file = createMcpStory(fixture.root)
    file.story.docsText = ''
    const { content, catalog } = await service(file)
    file.story.docsText = 'later'
    expect(await content.getDocs({ storyId: file.story.id })).toMatchObject({ kind: 'text', origin: 'collected', text: '', totalCharacters: 0 })
    delete file.story.docsText
    await catalog.publish(createMcpContext(fixture.root, [file]))
    await expect(content.getDocs({ storyId: file.story.id })).rejects.toMatchObject({ code: 'DOCS_NOT_FOUND' })
  })

  it('rejects edits before publication for source and collected docs, even without expectedRevision', async () => {
    const file = await fixture.physical('first\n')
    file.story.docsText = 'captured inline docs'
    const { content, catalog } = await service(file)
    const revision = catalog.current.revision
    await writeFile(file.path, 'second\n')
    await expect(content.getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await expect(content.getDocs({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await catalog.publish(createMcpContext(fixture.root, [file]))
    expect((await content.getSource({ storyId: file.story.id })).sha256).toBe(hashContent('second\n'))
    await expect(content.getSource({ storyId: file.story.id, expectedRevision: revision })).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await expect(content.getSource({ storyId: 'foreign' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
    await unlink(file.path)
    await expect(content.getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
  })
})

describe('exact bounded content paging', () => {
  it('pages Unicode code points without splitting surrogate pairs and retains whole text hash', () => {
    const text = 'A🐈éB'
    expect(pageDocsText(text, 1, 2)).toEqual({ text: '🐈é', offset: 1, nextOffset: 3, totalCharacters: 4, sha256: hashContent(text) })
    expect(pageDocsText(text, 4, 1)).toMatchObject({ text: '', offset: 4, totalCharacters: 4 })
    expect(() => pageDocsText(text, 5, 1)).toThrow()
  })

  it('preserves CRLF, trailing newlines, blank lines, and exact range end', () => {
    const text = 'a\r\n🐈\n\nlast'
    expect(pageSourceText(text, 2, 2)).toEqual({ text: '🐈\n\n', startLine: 2, endLine: 3, totalLines: 4, nextLine: 4, sha256: hashContent(text) })
    expect(pageSourceText(text, 4, 200)).toEqual({ text: 'last', startLine: 4, endLine: 4, totalLines: 4, sha256: hashContent(text) })
    expect(pageSourceText('a\n', 1, 200)).toMatchObject({ text: 'a\n', endLine: 1, totalLines: 1 })
    expect(pageSourceText('', 1, 200)).toMatchObject({ text: '', startLine: 1, endLine: 0, totalLines: 0 })
    expect(() => pageSourceText(text, 5, 1)).toThrow()
  })

  it('rejects oversized selected lines without silent truncation', () => {
    expect(() => pageSourceText('x'.repeat(128 * 1024), 1, 1)).toThrowError(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
    expect(() => pageSourceText('one', 1, 501)).toThrow()
    expect(() => pageDocsText('one', 0, 32769)).toThrow()
    expect(() => pageDocsText('🐈'.repeat(32768), 0, 32768)).toThrowError(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
  })
})
