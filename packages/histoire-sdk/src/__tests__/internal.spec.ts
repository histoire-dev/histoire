import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { getHistoireSessionDescriptor, registerHistoireSessionInternals, requestHistoireOpenInEditor, requestHistoireStatePreset } from '../session/internal.js'
import { sourceFixture } from './fixtures/session.js'

describe('first-party source metadata', () => {
  it('shares finite detached delegates with separately loaded SDK copy and preserves disposal guards', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    vi.resetModules()
    const peer = await import('../session/internal.js')
    expect(peer.getHistoireSessionDescriptor(session)).toEqual(getHistoireSessionDescriptor(session))
    expect(Object.keys(session).some(key => key.includes('internals'))).toBe(false)
    const descriptor = peer.getHistoireSessionDescriptor(session)
    descriptor.catalog.stories = []
    expect(peer.getHistoireSessionDescriptor(session).catalog.stories.length).toBeGreaterThan(0)
    await session.dispose()
    expect(() => peer.getHistoireSessionDescriptor(session)).toThrow('Session disposed.')
  })
  it('admits only exact collected editor targets and requires advertised dev capability', async () => {
    const fixture = sourceFixture()
    fixture.request.mockImplementation(async command => command === 'openInEditor' ? null : undefined)
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await requestHistoireOpenInEditor(session, { storyId: 'a:b', variantId: 'c' })
    expect(fixture.request).toHaveBeenCalledWith('openInEditor', { storyId: 'a:b', variantId: 'c' }, expect.any(Object))
    await expect(requestHistoireOpenInEditor(session, { storyId: 'unknown', variantId: null })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
    await expect(requestHistoireOpenInEditor(session, { storyId: 'a:b', variantId: 'c', file: '/private' } as any)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    fixture.descriptor.mode = 'static'
    fixture.descriptor.capabilities.openInEditor = { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
    fixture.emitCatalog()
    await expect(requestHistoireOpenInEditor(session, { storyId: 'a:b', variantId: 'c' })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    await session.dispose()
  })
  it('exposes synchronously failing proxy delegates as observed rejected operations', async () => {
    const session = {} as any
    registerHistoireSessionInternals(session, { descriptor: () => {
      throw new Error('closed')
    }, presets: () => {
      throw new Error('closed')
    } })
    let operation!: Promise<unknown>
    expect(() => {
      operation = requestHistoireStatePreset(session, { action: 'list' })
    }).not.toThrow()
    await expect(operation).rejects.toThrow('closed')
    await expect(requestHistoireStatePreset({} as any, { action: 'list' })).rejects.toThrow('Runtime preset adapter unavailable')
  })

  it('tracks validated descriptor changes with getter-only source adapters and returns detached values', async () => {
    const fixture = sourceFixture()
    Object.defineProperty(fixture.connection, 'descriptor', { get: () => fixture.descriptor })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    fixture.descriptor.revision = 'revision-new'
    fixture.descriptor.catalog.stories = [...fixture.descriptor.catalog.stories, { ...fixture.descriptor.catalog.stories[0], id: 'added' }]
    fixture.emitCatalog()
    expect(session.getSnapshot().source?.revision).toBe('revision-new')
    const metadata = getHistoireSessionDescriptor(session)
    expect(metadata.catalog.stories.map(story => story.id)).toContain('added')
    metadata.catalog.stories = []
    expect(getHistoireSessionDescriptor(session).catalog.stories).not.toHaveLength(0)
    await session.dispose()
    expect(() => getHistoireSessionDescriptor(session)).toThrow('Session disposed.')
  })
})
