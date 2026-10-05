import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

/** Mounting fixture container never dereferenced by injected transport. */
const container = {} as HTMLElement

describe('explicit runtime ownership and state', () => {
  it('accepts null-document retirement, rejects pending work and never revives retired document', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    const mount = session.mount(container, { surface: 'preview' })
    await mount.ready
    const completion = deferred<any>()
    fixture.request.mockImplementationOnce(() => completion.promise)
    const run = session.tests.run({ mode: 'preview' })
    await Promise.resolve()
    for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtimeId: undefined, runtime: { ...fixture.runtime(), status: 'stale', runtimeId: null } })
    expect(session.getSnapshot().runtime.status).toBe('stale')
    await expect(run).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    fixture.ready()
    expect(session.getSnapshot().runtime.status).toBe('stale')
    expect(() => session.createHiddenPreview()).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
    completion.reject(new Error('old document failure'))
    await Promise.resolve()
    await mount.unmount()
    await session.dispose()
  })

  it('uses source story collection budget when explicit edit awaits replacement', async () => {
    vi.useFakeTimers()
    const fixture = sourceFixture()
    fixture.descriptor.config = { title: 'Book', theme: { defaultColorScheme: 'auto', darkClass: 'dark' }, responsivePresets: [], backgroundPresets: [], autoApplyContrastColor: false, storyCollectTimeout: 45_000 }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    try {
      await session.connect()
      await session.selection.select({ storyId: 'a:b' })
      await session.mount(container, { surface: 'preview' }).ready
      fixture.reload()
      let finished = false
      const patch = session.state.patch({ count: 99 }).finally(() => {
        finished = true
      })
      const rejected = expect(patch).rejects.toMatchObject({ code: 'TIMEOUT' })
      await vi.advanceTimersByTimeAsync(30_001)
      expect(finished).toBe(false)
      await vi.advanceTimersByTimeAsync(15_000)
      await rejected
    }
    finally {
      await session.dispose()
      vi.useRealTimers()
    }
  })

  it('closes transport despite observer cleanup failure and releases confirmed primary', async () => {
    const fixture = sourceFixture()
    fixture.adapters.mount = ((mount) => {
      const surface = { id: 'surface-connection', ready: Promise.resolve({ ...fixture.runtime(), mountId: mount.mountId }), request: fixture.request, close: fixture.surfaceClose, subscribe: () => () => {
        throw new Error('observer cleanup failed')
      } }
      return surface
    }) as typeof fixture.adapters.mount
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    const mount = session.mount(container, { surface: 'preview' })
    await mount.ready
    await expect(mount.unmount()).rejects.toThrow('observer cleanup failed')
    expect(fixture.surfaceClose).toHaveBeenCalledOnce()
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('retains primary reservation after unconfirmed teardown', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    const mount = session.mount(container, { surface: 'preview' })
    await mount.ready
    fixture.surfaceClose.mockRejectedValue(new Error('cleanup unconfirmed'))
    await expect(mount.unmount()).rejects.toThrow('cleanup unconfirmed')
    expect(session.getSnapshot().runtime.status).toBe('failed')
    expect(() => session.createHiddenPreview()).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
    await expect(session.dispose()).rejects.toThrow('cleanup unconfirmed')
  })

  it('requires primary runtime and reserves its slot until complete teardown', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await expect(session.state.get()).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
    const mount = session.mount(container, { surface: 'preview' })
    expect(() => session.mount(container, { surface: 'grid' })).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
    await mount.ready
    expect((await session.state.get()).value).toMatchObject({ count: 5 })
    const teardown = deferred<void>()
    fixture.surfaceClose.mockImplementation(() => teardown.promise)
    const unmounting = mount.unmount()
    expect(() => session.createHiddenPreview()).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
    teardown.resolve()
    await unmounting
    const hidden = session.createHiddenPreview()
    await hidden.ready
    expect(session.getSnapshot().runtime.viewports).toEqual([])
    await session.dispose()
  })

  it('uses runtime baseline, forwards explicit patches, suppresses state echoes and protects derived metadata', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await session.mount(container, { surface: 'preview' }).ready
    fixture.emitState()
    expect(session.getSnapshot().state?.value).toMatchObject({ count: 5 })
    const before = fixture.request.mock.calls.length
    fixture.emitState()
    expect(fixture.request.mock.calls).toHaveLength(before)
    await session.state.patch({ count: 10, _hPropState: { title: 'override' } })
    expect(session.getSnapshot().state?.value).toMatchObject({ count: 10, _hPropState: { title: 'override' } })
    await expect(session.state.patch({ _hPropDefs: {} })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await session.state.reset()
    expect(session.getSnapshot().state?.value).toMatchObject({ count: 5 })
    await session.dispose()
  })

  it('queues only user patches during reload and rejects edits overtaken by selection', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await session.mount(container, { surface: 'preview' }).ready
    fixture.emitState()
    fixture.reload()
    const patch = session.state.patch({ count: 12 })
    expect(session.getSnapshot().state).toBeNull()
    fixture.ready()
    await patch
    expect(session.getSnapshot().state?.value).toMatchObject({ count: 12 })
    fixture.reload()
    const superseded = session.state.patch({ count: 99 })
    await session.selection.select({ storyId: 'a', variantId: 'b:c' })
    await expect(superseded).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    await session.dispose()
  })

  it('rejects stale runtime replies and observes late failures after unmount', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    const mount = session.mount(container, { surface: 'preview' })
    await mount.ready
    const completion = deferred<any>()
    fixture.request.mockImplementationOnce(() => completion.promise)
    const run = session.tests.run({ mode: 'preview' })
    await Promise.resolve()
    await mount.unmount()
    await expect(run).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    completion.reject(new Error('late failure'))
    await Promise.resolve()
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
  })

  it('retains 1000 attributable events, tracks drops and cleans subscriptions', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await session.mount(container, { surface: 'preview' }).ready
    const listener = vi.fn()
    const unsubscribe = session.events.subscribe(listener)
    for (let sequence = 1; sequence <= 1003; sequence++) fixture.emitEvent(sequence)
    expect(session.getSnapshot().events.items).toHaveLength(1000)
    expect(session.getSnapshot().events.droppedCount).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1003)
    unsubscribe()
    session.events.clear()
    expect(session.getSnapshot().events).toEqual({ items: [], droppedCount: 0 })
    await session.dispose()
    expect(fixture.frameListeners.size).toBe(0)
  })
})
