import { describe, expect, it } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { sourceFixture } from './fixtures/session.js'

describe('ambiguous variant ownership', () => {
  it('rejects explicit and implicit ambiguous targets before selection or content requests', async () => {
    const fixture = sourceFixture()
    const story = fixture.descriptor.catalog.stories.find(story => story.id === 'a:b')!
    story.variants = [...story.variants, { ...story.variants[0] }]
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'docs' })
    const before = session.getSnapshot().selection
    await expect(session.selection.select({ storyId: story.id, variantId: 'c' })).rejects.toMatchObject({ code: 'STORY_AMBIGUOUS' })
    await expect(session.selection.select({ storyId: story.id })).rejects.toMatchObject({ code: 'STORY_AMBIGUOUS' })
    await expect(session.source.get({ storyId: story.id, variantId: 'c', mode: 'raw' })).rejects.toMatchObject({ code: 'STORY_AMBIGUOUS' })
    expect(session.getSnapshot().selection).toEqual(before)
    expect(fixture.request).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('clears a selected target when a published catalog makes its variant ambiguous', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const story = fixture.descriptor.catalog.stories.find(story => story.id === 'a:b')!
    story.variants = [...story.variants, { ...story.variants[0] }]
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    expect(session.getSnapshot().selection).toBeNull()
    expect(session.getSnapshot().state).toBeNull()
    await session.dispose()
  })
})
