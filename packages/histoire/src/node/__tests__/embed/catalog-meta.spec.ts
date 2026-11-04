import { HISTOIRE_META_LIMITS, HISTOIRE_WIRE_LIMITS, validateHistoireCatalog } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_DIAGNOSTICS } from '../../runtime/catalog/diagnostics.js'
import { createEmbedDescriptor } from '../../virtual/embed/descriptor.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

// Descriptor tests use the exact source implementation when bundled app dist is not built.
vi.mock('@histoire/app/dist/embed/capabilities.js', async () => import('../../../../../histoire-app/src/embed/capabilities.js'))

describe('catalog story metadata', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('publishes JSON meta of stories and variants in dev and static descriptors', async () => {
    const story = fixture.story.story
    story.meta = { design: { type: 'image', url: '/a.png' }, setup: () => {} } as any
    story.variants[0].meta = { design: [{ type: 'link', url: 'https://example.com' }] } as any
    await fixture.catalog.publish(fixture.context)
    for (const mode of ['dev', 'static'] as const) {
      const descriptor = createEmbedDescriptor(fixture.context, fixture.catalog.current, mode, mode === 'static' ? 'build-1' : undefined)
      const projected = descriptor.catalog.stories.find(item => item.id === story.id)!
      expect(projected.meta).toEqual({ design: { type: 'image', url: '/a.png' } })
      expect(projected.variants[0].meta).toEqual({ design: [{ type: 'link', url: 'https://example.com' }] })
      expect(() => validateHistoireCatalog(descriptor.catalog)).not.toThrow()
    }
  })

  it('leaves metadata out when absent', async () => {
    await fixture.catalog.publish(fixture.context)
    const projected = fixture.catalog.current.catalog.stories[0]
    expect('meta' in projected).toBe(false)
    expect('meta' in projected.variants[0]).toBe(false)
  })

  it('drops oversized metadata with a warning instead of failing the catalog', async () => {
    const story = fixture.story.story
    story.meta = { text: 'x'.repeat(HISTOIRE_WIRE_LIMITS.metadata) } as any
    await fixture.catalog.publish(fixture.context)
    const catalog = fixture.catalog.current.catalog
    expect(catalog.stories[0].meta).toBeUndefined()
    expect(catalog.diagnostics).toContainEqual(expect.objectContaining({ code: 'STORY_META_TOO_LARGE', severity: 'warning', storyId: story.id }))
    expect(fixture.catalog.current.outcome).toBe('success')
  })

  it('warns about metadata dropped at collection', async () => {
    fixture.story.story.variants[0].metaOmitted = true
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.diagnostics).toContainEqual(expect.objectContaining({ code: 'STORY_META_TOO_LARGE', message: expect.stringContaining('variant'), severity: 'warning' }))
  })

  it('keeps the whole catalog valid when many stories carry metadata', async () => {
    const story = fixture.story.story
    // Each meta is within its own bounds, but together they exceed the catalog edge limit.
    const count = Math.ceil(HISTOIRE_WIRE_LIMITS.edges / 8000) + 1
    story.variants = Array.from({ length: count }, (_, index) => ({ id: `v${index}`, title: `V${index}`, meta: { list: Array.from({ length: 8000 }, () => 0) } }))
    await fixture.catalog.publish(fixture.context)
    const catalog = fixture.catalog.current.catalog
    expect(() => validateHistoireCatalog(catalog)).not.toThrow()
    const kept = catalog.stories[0].variants.filter(variant => variant.meta).length
    expect(kept).toBe(Math.floor(HISTOIRE_META_LIMITS.catalogNodes / 8002))
    expect(catalog.diagnostics.filter(item => item.code === 'STORY_META_TOO_LARGE')).toHaveLength(count - kept)
  })

  it('bounds metadata warnings like other diagnostics', async () => {
    fixture.story.story.variants = Array.from({ length: MAX_DIAGNOSTICS * 2 }, (_, index) => ({ id: `v${index}`, title: `V${index}`, metaOmitted: true }))
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.diagnostics.length).toBe(MAX_DIAGNOSTICS)
  })

  it('keeps the runtime revision when only metadata changes', async () => {
    const story = fixture.story.story
    const revision = () => fixture.catalog.current.catalog.stories[0].runtimeRevision
    const initial = revision()
    story.meta = { design: { url: '/a.png' } } as any
    story.variants[0].meta = { design: { url: '/b.png' } } as any
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories[0].variants[0].meta).toBeDefined()
    expect(revision()).toBe(initial)
  })
})
