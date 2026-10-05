import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareEmbedOutput, writeEmbedDescriptor } from '../../virtual/embed/output.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('lazy static content assets', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('emits original source, rendered/text docs and structured search without build identity cycles', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const prepared = await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')
    const descriptor = await writeEmbedDescriptor(fixture.context, prepared, fixture.root, 'build-final')
    const references = descriptor.assets.content[0]
    const docs = JSON.parse(await readFile(join(fixture.root, references.docs), 'utf8'))
    const raw = JSON.parse(await readFile(join(fixture.root, references.rawSource), 'utf8'))
    expect(docs).toMatchObject({ storyId: fixture.story.story.id, body: 'lazy-doc-body', format: 'text' })
    expect(raw).toMatchObject({ storyId: fixture.story.story.id, body: expect.stringContaining('source-body'), mode: 'raw' })
    expect(docs).not.toHaveProperty('epoch')
    expect(raw).not.toHaveProperty('revision')
    const search = JSON.parse(await readFile(join(fixture.root, descriptor.assets.search), 'utf8'))
    expect(search.docs[0]).toMatchObject({ target: { storyId: fixture.story.story.id, variantId: null }, text: 'lazy-doc-body' })
    expect(JSON.stringify(search)).not.toContain(fixture.root)
  })

  it('changes immutable docs URL when renderer output changes with identical Markdown text', async () => {
    const absolutePath = join(fixture.root, 'a.story.md')
    await writeFile(absolutePath, '# Body\n')
    fixture.story.markdownFile = { id: 'docs', relativePath: 'a.story.md', absolutePath, isRelatedToStory: true, content: '# Body\n', frontmatter: {}, html: '<h1>Body</h1>' }
    await fixture.catalog.publish(fixture.context)
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const before = source.getDescriptor().assets.content[0].docs
    await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')
    fixture.story.markdownFile.html = '<h1 id="body">Body</h1>'
    await fixture.catalog.publish(fixture.context)
    const after = source.getDescriptor().assets.content[0].docs
    await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')
    expect(after).not.toBe(before)
    const read = async (reference: string) => JSON.parse(await readFile(join(fixture.root, reference), 'utf8'))
    expect(await read(before)).toMatchObject({ format: 'html', body: '<h1>Body</h1>' })
    expect(await read(after)).toMatchObject({ format: 'html', body: '<h1 id="body">Body</h1>' })
  })
})
