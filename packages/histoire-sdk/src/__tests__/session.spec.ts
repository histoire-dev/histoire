import { describe, expect, it, vi } from 'vitest'
import { createHistoireSession } from '../index.js'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

describe('session connection and selection', () => {
  it('constructs without DOM, normalizes source URL, and does not connect implicitly', async () => {
    const session = createHistoireSession({ url: 'https://book.test/nested' })
    expect(session.getSnapshot().status).toBe('idle')
    expect(session.getSnapshot().source).toBeNull()
    await expect(session.connect()).rejects.toMatchObject({ code: 'BROWSER_REQUIRED' })
    expect(() => createHistoireSession({ url: 'file:///book' })).toThrow()
  })

  it('shares connect and isolates coherent observable snapshots across sessions', async () => {
    const fixture = sourceFixture()
    const other = sourceFixture()
    const first = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const second = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, other.adapters)
    const listener = vi.fn()
    const off = first.subscribe(listener)
    const connection = deferred<typeof fixture.connection>()
    fixture.adapters.connect = vi.fn(() => connection.promise)
    const opening = first.connect()
    expect(first.connect()).toBe(opening)
    connection.resolve(fixture.connection)
    await Promise.all([opening, second.connect()])
    await first.selection.select({ storyId: 'a:b', variantId: 'other' })
    await second.selection.select({ storyId: 'a', variantId: 'b:c' })
    await first.settings.update({ colorScheme: 'dark' })
    expect(first.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
    expect(second.getSnapshot().selection).toEqual({ storyId: 'a', variantId: 'b:c' })
    expect(second.getSnapshot().settings.colorScheme).toBe('auto')
    off()
    const count = listener.mock.calls.length
    await first.selection.select({ storyId: 'docs' })
    expect(listener).toHaveBeenCalledTimes(count)
    await Promise.all([first.dispose(), second.dispose()])
  })

  it('restores valid remembered variants, rejects explicit bad IDs, and permits docs-only/null selection', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    expect(session.getSnapshot().selection?.variantId).toBe('c')
    await session.selection.select({ storyId: 'a:b', variantId: 'other' })
    await session.selection.select({ storyId: 'docs' })
    expect(session.getSnapshot().selection?.variantId).toBeNull()
    await session.selection.select({ storyId: 'a:b' })
    expect(session.getSnapshot().selection?.variantId).toBe('other')
    await expect(session.selection.select({ storyId: 'a:b', variantId: 'missing' })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
    await expect(session.selection.select({ storyId: 'missing' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
    expect(session.getSnapshot().selection?.variantId).toBe('other')
    await session.selection.select({ storyId: 'a:b', variantId: null })
    expect(session.getSnapshot().selection?.variantId).toBeNull()
    await expect(session.selection.select({ storyId: 'docs', variantId: 'c' })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
    await session.dispose()
  })

  it('publishes catalog revisions atomically and invalidates removed selected variants', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'other' })
    fixture.descriptor.catalog = { ...fixture.descriptor.catalog, stories: fixture.descriptor.catalog.stories.map(story => story.id === 'a:b' ? { ...story, variants: [story.variants[0]] } : story) }
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    expect(session.getSnapshot().source?.revision).toBe('revision-2')
    expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    await session.dispose()
  })

  it('keeps observers isolated when another observer throws', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    session.subscribe(() => {
      throw new Error('observer')
    })
    const listener = vi.fn()
    session.subscribe(listener)
    await session.connect()
    expect(listener).toHaveBeenCalled()
    await session.dispose()
    expect(fixture.listeners.size).toBe(0)
  })
})
