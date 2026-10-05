import { writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'
import { MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('source generation/revision ownership', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('publishes completed source edits and rejects stale content while preserving failed diagnostics', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const events: unknown[] = []
    const off = source.subscribe(descriptor => events.push(descriptor))
    const before = source.getDescriptor()
    await writeFile(fixture.story.path, 'changed-source')
    await expect(source.getSource(fixture.story.story.id, before.revision)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await fixture.catalog.publish(fixture.context)
    expect(source.getDescriptor().revision).not.toBe(before.revision)
    expect(events).toHaveLength(1)
    await fixture.catalog.publish(fixture.context, new Map([[fixture.story.path, { status: 'failed', error: 'broken collection' }]]))
    expect(source.getDescriptor().catalog.diagnostics.length).toBeGreaterThan(0)
    expect(source.getDescriptor().capabilities.catalog.available).toBe(false)
    await fixture.catalog.publish(fixture.context)
    expect(source.getDescriptor().capabilities.catalog.available).toBe(true)
    off()
    const replacement = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, epoch: 'next-epoch', root: fixture.root })
    await replacement.publish(fixture.context)
    expect(createEmbedSource(fixture.context, replacement).getDescriptor().epoch).toBe('next-epoch')
  })
})
