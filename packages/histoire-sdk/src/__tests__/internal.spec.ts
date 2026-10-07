import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { getAcceptedHistoireSessionDescriptor, getHistoireSessionDescriptor, isAcceptedHistoireSourceDescriptor, registerHistoireSessionInternals, requestHistoireOpenInEditor, requestHistoireStatePreset } from '../session/internal.js'
import { sourceFixture } from './fixtures/session.js'

describe('first-party source metadata', () => {
  it('shares finite detached delegates with separately loaded SDK copy and preserves disposal guards', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    vi.resetModules()
    const peer = await import('../session/internal.js')
    const accepted = getAcceptedHistoireSessionDescriptor(session)
    const peerAccepted = peer.getAcceptedHistoireSessionDescriptor(session)
    expect(peer.getHistoireSessionDescriptor(session)).toEqual(getHistoireSessionDescriptor(session))
    expect(peerAccepted).toEqual(accepted)
    expect(peerAccepted).not.toBe(accepted)
    expect(peer.isAcceptedHistoireSourceDescriptor(peerAccepted)).toBe(false)
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
  it.each(['generated', 'external'] as const)('rejects editor requests for %s story files before transport', async (fileOrigin) => {
    const fixture = sourceFixture()
    fixture.descriptor.catalog.stories[0].fileOrigin = fileOrigin
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await expect(requestHistoireOpenInEditor(session, { storyId: 'a:b', variantId: 'c' })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(fixture.request).not.toHaveBeenCalledWith('openInEditor', expect.anything(), expect.anything())
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

  /** Accepted metadata stays shared and immutable while the public getter stays detached. */
  it('shares one frozen accepted projection without changing detached getter semantics', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()

    try {
      const accepted = getAcceptedHistoireSessionDescriptor(session)
      expect(getAcceptedHistoireSessionDescriptor(session)).toBe(accepted)
      expect(isAcceptedHistoireSourceDescriptor(accepted)).toBe(true)
      expect(isAcceptedHistoireSourceDescriptor(structuredClone(accepted))).toBe(false)
      expect(accepted).not.toBe(fixture.descriptor)
      expect(Object.isFrozen(accepted)).toBe(true)
      expect(Object.isFrozen(accepted.catalog)).toBe(true)
      expect(Object.isFrozen(accepted.catalog.stories)).toBe(true)
      expect(Object.isFrozen(accepted.catalog.stories[0])).toBe(true)

      const detached = getHistoireSessionDescriptor(session)
      expect(detached).not.toBe(accepted)
      expect(isAcceptedHistoireSourceDescriptor(detached)).toBe(false)
      detached.catalog.stories = []
      fixture.descriptor.catalog.stories[0].title = 'Changed after acceptance'

      expect(getHistoireSessionDescriptor(session).catalog.stories).not.toHaveLength(0)
      expect(getAcceptedHistoireSessionDescriptor(session)).toBe(accepted)
      expect(accepted.catalog.stories[0].title).toBe('First')
    }
    finally {
      await session.dispose()
    }
  })

  /** Same-revision replacement identity must not be hidden by revision-only caching. */
  it('mints a new accepted projection when descriptor object changes at same revision', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()

    try {
      const first = getAcceptedHistoireSessionDescriptor(session)
      fixture.descriptor.catalog.stories[0].title = 'Same revision replacement'
      fixture.emitCatalog()

      const next = getAcceptedHistoireSessionDescriptor(session)
      expect(next).not.toBe(first)
      expect(next.revision).toBe(first.revision)
      expect(next.catalog.stories[0].title).toBe('Same revision replacement')
      expect(isAcceptedHistoireSourceDescriptor(next)).toBe(true)
    }
    finally {
      await session.dispose()
    }
  })

  /** A previously observed mutable adapter object still crosses validation on every publication. */
  it('rejects malformed mutation of a previously accepted adapter descriptor', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()

    try {
      const accepted = getAcceptedHistoireSessionDescriptor(session)
      fixture.descriptor.catalog.stories[0].id = ''
      fixture.emitCatalog()

      expect(session.getSnapshot().stale).toBe(true)
      expect(getAcceptedHistoireSessionDescriptor(session)).toBe(accepted)
      expect(accepted.catalog.stories[0].id).toBe('a:b')
    }
    finally {
      await session.dispose()
    }
  })

  /** A replica connection reuses only a projection minted by the SDK validator. */
  it('preserves identity for SDK-minted descriptors admitted by another session', async () => {
    const source = sourceFixture()
    const canonical = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
    await canonical.connect()
    const accepted = getAcceptedHistoireSessionDescriptor(canonical)

    const replica = sourceFixture()
    Object.defineProperty(replica.connection, 'descriptor', { get: () => accepted })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, replica.adapters)
    try {
      await session.connect()
      expect(getAcceptedHistoireSessionDescriptor(session)).toBe(accepted)
    }
    finally {
      await Promise.all([session.dispose(), canonical.dispose()])
    }
  })
})
