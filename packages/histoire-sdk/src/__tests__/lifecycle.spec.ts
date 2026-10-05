import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

describe('source operation ownership and persistence', () => {
  it('rejects disposal during connection immediately and closes late acquired source once', async () => {
    const fixture = sourceFixture()
    const acquisition = deferred<typeof fixture.connection>()
    fixture.adapters.connect = () => acquisition.promise
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const connect = session.connect()
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe('connecting'))
    await new Promise(resolve => setTimeout(resolve, 0))
    const closing = session.dispose()
    await expect(connect).rejects.toMatchObject({ code: 'DISPOSED' })
    acquisition.resolve(fixture.connection)
    await closing
    await Promise.resolve()
    expect(fixture.close).toHaveBeenCalledTimes(1)
    expect(session.getSnapshot().status).toBe('disposed')
    await expect(session.connect()).rejects.toMatchObject({ code: 'DISPOSED' })
  })

  it('disconnect retains stale metadata, rejects pending reads, and reconnect is explicit', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    const response = deferred<any>()
    fixture.request.mockImplementationOnce(() => response.promise)
    const docs = session.docs.get('a:b')
    await Promise.resolve()
    fixture.emitDisconnect()
    await expect(docs).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    expect(session.getSnapshot()).toMatchObject({ status: 'disconnected', stale: true })
    expect(fixture.adapters.connect).toHaveBeenCalledTimes(1)
    response.resolve({ body: 'late' })
    await session.connect()
    expect(fixture.adapters.connect).toHaveBeenCalledTimes(2)
    await session.dispose()
  })

  it('checks unsupported modes/capabilities and cancellation before any execution', async () => {
    const fixture = sourceFixture()
    fixture.descriptor.mode = 'static'
    fixture.descriptor.capabilities.serverTests = { available: false, reason: 'Static source' }
    fixture.descriptor.capabilities.docs = { available: false, reason: 'Unavailable' }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await expect(session.docs.get('a:b')).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    await expect(session.tests.run({ mode: 'server' })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    const controller = new AbortController()
    controller.abort()
    fixture.descriptor.mode = 'dev'
    fixture.descriptor.capabilities.serverTests = { available: true }
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    await expect(session.tests.run({ mode: 'server', signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.request).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('never touches storage by default and namespaces opt-in preferences by source/key', async () => {
    const saved = new Map<string, string>()
    const storage = { getItem: vi.fn((key: string) => saved.get(key) ?? null), setItem: vi.fn((key: string, value: string) => saved.set(key, value)) }
    const create = (url: string, persistenceKey?: string) => {
      const fixture = sourceFixture()
      fixture.adapters.storage = () => storage
      return createHistoireSessionWithAdapters({ url, persistenceKey }, fixture.adapters)
    }
    const memory = create('https://book.test/')
    await memory.connect()
    await memory.settings.update({ colorScheme: 'dark' })
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    const first = create('https://book.test/', 'host')
    await first.connect()
    await first.settings.update({ colorScheme: 'dark' })
    const restored = create('https://book.test/', 'host')
    const key = create('https://book.test/', 'other')
    const source = create('https://other.test/', 'host')
    await Promise.all([restored.connect(), key.connect(), source.connect()])
    expect(restored.getSnapshot().settings.colorScheme).toBe('dark')
    expect(key.getSnapshot().settings.colorScheme).toBe('auto')
    expect(source.getSnapshot().settings.colorScheme).toBe('auto')
    await Promise.all([memory, first, restored, key, source].map(session => session.dispose()))
  })

  it('storage denial falls back to memory without breaking connection or settings', async () => {
    const fixture = sourceFixture()
    fixture.adapters.storage = () => {
      throw new Error('Denied')
    }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/', persistenceKey: 'host' }, fixture.adapters)
    await session.connect()
    await session.settings.update({ textDirection: 'rtl' })
    expect(session.getSnapshot().settings.textDirection).toBe('rtl')
    await session.dispose()
  })
})
