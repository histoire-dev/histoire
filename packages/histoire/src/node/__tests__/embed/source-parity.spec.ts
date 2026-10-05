import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { readRegisteredText } from '../../runtime/content/files.js'
import { createRuntimeContent } from '../../runtime/content/service.js'
import { getResolvedStorySourceId, storySource } from '../../virtual/story-source.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('registered source and generation parity', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it.each(['physical', 'virtual'])('preserves original %s source panel bytes', async (kind) => {
    const raw = '\uFEFF<script>const word = "🐈"</script>\r\n<template/>\n'
    const file = kind === 'physical' ? await fixture.physical(raw, 'a.story.vue') : createMcpStory(fixture.root)
    if (kind === 'virtual') file.moduleCode = raw
    const ctx = createMcpContext(fixture.root, [file])
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await catalog.publish(ctx)
    const content = createRuntimeContent({ root: fixture.root, catalog })
    expect(await content.getSource(file.story.id)).toMatchObject({ origin: kind === 'physical' ? 'file' : 'virtual', body: raw })
    expect(await storySource(ctx, getResolvedStorySourceId(file.story.id))).toBe(`export default ${JSON.stringify(raw)}`)
  })

  it('keeps admission blocked when newer batch starts during older content hashing', async () => {
    const file = await fixture.physical('source')
    const ctx = createMcpContext(fixture.root, [file])
    const reading = deferred<void>()
    const release = deferred<void>()
    let pause = false
    const readText = async (root: string, path: string) => {
      const captured = await readRegisteredText(root, path)
      if (pause) {
        reading.resolve()
        await release.promise
      }
      return captured
    }
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root, readText })
    await catalog.publish(ctx)
    const original = catalog.current
    pause = true
    catalog.markUpdating()
    file.story.title = 'Older'
    const older = catalog.publish(ctx)
    await reading.promise
    catalog.markUpdating()
    file.story.title = 'Newer'
    release.resolve()
    await older
    expect(catalog.current).toBe(original)
    expect(catalog.updating).toBe(true)
    pause = false
    await catalog.publish(ctx)
    expect(catalog.current.catalog.stories[0].title).toBe('Newer')
    expect(catalog.updating).toBe(false)
  })

  it('rejects lazy source response overtaken by a new revision', async () => {
    const file = await fixture.physical('source')
    const ctx = createMcpContext(fixture.root, [file])
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await catalog.publish(ctx)
    const reading = deferred<void>()
    const release = deferred<void>()
    const content = createRuntimeContent({ root: fixture.root, catalog, readText: async (root, path) => {
      const value = await readRegisteredText(root, path)
      reading.resolve()
      await release.promise
      return value
    } })
    const pending = content.getSource(file.story.id)
    await reading.promise
    file.story.title = 'Updated'
    await catalog.publish(ctx)
    release.resolve()
    await expect(pending).rejects.toMatchObject({ code: 'STALE_REVISION' })
  })
})
