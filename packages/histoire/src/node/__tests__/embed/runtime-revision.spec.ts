import { writeFile } from 'node:fs/promises'
import { validateHistoireCatalogStory } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmbedDescriptor } from '../../virtual/embed/descriptor.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'
import { createMcpStory } from '../utils/mcp/project.js'

// Descriptor tests use the exact source implementation when bundled app dist is not built.
vi.mock('@histoire/app/dist/embed/capabilities.js', async () => import('../../../../../histoire-app/src/embed/capabilities.js'))

describe('canonical runtime digest projection', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('scopes digests to source bytes and executable metadata across local and embed descriptors', async () => {
    const second = createMcpStory(fixture.root, 'second', 'second.story.js')
    fixture.context.storyFiles.push(second)
    await fixture.catalog.publish(fixture.context)
    const initial = fixture.catalog.current
    const firstDigest = initial.catalog.stories.find(story => story.id === fixture.story.story.id)!.runtimeRevision
    const secondDigest = initial.catalog.stories.find(story => story.id === 'second')!.runtimeRevision
    expect(firstDigest).toMatch(/^[a-f0-9]{64}$/)
    for (const namespace of ['local', 'embed'] as const) {
      const descriptor = createEmbedDescriptor(fixture.context, initial, 'dev', undefined, namespace)
      expect(descriptor.catalog.stories.find(story => story.id === fixture.story.story.id)!.runtimeRevision).toBe(firstDigest)
    }
    second.moduleCode = 'export default { changed: true }'
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories.find(story => story.id === fixture.story.story.id)!.runtimeRevision).toBe(firstDigest)
    expect(fixture.catalog.current.catalog.stories.find(story => story.id === 'second')!.runtimeRevision).not.toBe(secondDigest)
    const changedSource = fixture.catalog.current.catalog.stories.find(story => story.id === 'second')!.runtimeRevision
    second.story.layout = { type: 'grid', width: 500 }
    await fixture.catalog.publish(fixture.context)
    const changedLayout = fixture.catalog.current.catalog.stories.find(story => story.id === 'second')!.runtimeRevision
    expect(changedLayout).not.toBe(changedSource)
    second.story.variants.push({ id: 'new', title: 'New' })
    await fixture.catalog.publish(fixture.context)
    const changedVariants = fixture.catalog.current.catalog.stories.find(story => story.id === 'second')!.runtimeRevision
    expect(changedVariants).not.toBe(changedLayout)
    second.supportPluginId = 'svelte'
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories.find(story => story.id === 'second')!.runtimeRevision).not.toBe(changedVariants)
    await writeFile(fixture.story.path, 'export const privateCode = "changed physical source"')
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories.find(story => story.id === fixture.story.story.id)!.runtimeRevision).not.toBe(firstDigest)
  })

  it('omits runtime digest when canonical source bytes are unavailable', async () => {
    const unavailable = createMcpStory(fixture.root, 'unavailable', 'unavailable.story.js')
    delete unavailable.moduleCode
    fixture.context.storyFiles.push(unavailable)
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories.find(story => story.id === 'unavailable')).not.toHaveProperty('runtimeRevision')
  })

  it('detaches layout and matrix metadata when publication is queued', async () => {
    const layout = { type: 'grid' as const, width: 100 }
    const values = ['sm']
    fixture.story.story.layout = layout
    fixture.story.story.matrix = { axes: { size: values } }
    await fixture.catalog.publish(fixture.context)
    const initial = fixture.catalog.current.catalog.stories[0].runtimeRevision
    const pending = fixture.catalog.publish(fixture.context)
    layout.width = 200
    values.push('lg')
    await pending
    expect(fixture.catalog.current.catalog.stories[0].runtimeRevision).toBe(initial)
    expect(fixture.catalog.current.catalog.stories[0].matrix.axes.size).toEqual(['sm'])
    await fixture.catalog.publish(fixture.context)
    expect(fixture.catalog.current.catalog.stories[0].runtimeRevision).not.toBe(initial)
  })

  it('validates optional runtime digest without granting equality to arbitrary source strings', () => {
    const story = fixture.catalog.current.catalog.stories[0]
    expect(validateHistoireCatalogStory(story).runtimeRevision).toMatch(/^[a-f0-9]{64}$/)
    for (const runtimeRevision of ['', '../private/file', 'a'.repeat(63), 'A'.repeat(64), 123]) {
      expect(() => validateHistoireCatalogStory({ ...story, runtimeRevision })).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }))
    }
  })
})
