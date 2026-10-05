import type { HistoireSessionNotification } from '../adapters/types.js'
import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

/** Fixture transport owns all DOM work; controller never dereferences this box. */
const container = {} as HTMLElement

describe('immutable projections and captured owners', () => {
  it('freezes snapshots without freezing caller/adapter projections', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await session.mount(container, { surface: 'preview' }).ready
    const state = await session.state.get()
    expect(Object.isFrozen(state.value)).toBe(true)
    expect(() => {
      state.value.count = 20
    }).toThrow(TypeError)
    expect(Object.isFrozen(fixture.descriptor)).toBe(false)
    expect(Object.isFrozen(fixture.state().value)).toBe(false)
    const snapshot = session.getSnapshot()
    fixture.descriptor.catalog.stories[0].title = 'Changed externally'
    expect(snapshot.catalog.stories[0].title).toBe('First')
    await session.settings.update({ colorScheme: 'dark' })
    expect(snapshot.settings.colorScheme).toBe('auto')
    expect(session.getSnapshot()).not.toBe(snapshot)
    await session.dispose()
  })

  it('drops old same-target document and wrong-port notifications after reload', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    await session.mount(container, { surface: 'preview' }).ready
    const old = fixture.owner()
    const oldRuntime = fixture.runtime()
    const oldState = fixture.state()
    oldState.value.count = 999
    fixture.reload()
    fixture.ready()
    const send = (event: HistoireSessionNotification) => {
      for (const listener of fixture.frameListeners) listener(event)
    }
    send({ type: 'state', ...old, state: oldState })
    send({ type: 'runtime', ...old, runtime: { ...oldRuntime, status: 'mounting' } })
    send({ type: 'runtime', ...old, runtime: oldRuntime })
    send({ type: 'state', ...fixture.owner(), connectionId: fixture.connection.id, state: { ...fixture.state(), value: { count: 999 } } })
    expect(session.getSnapshot().runtime.runtimeId).toBe('document-2')
    expect(session.getSnapshot().state?.value).toMatchObject({ count: 5 })
    await session.dispose()
  })

  it('observes abandoned public request rejection and late adapter failure', async () => {
    const fixture = sourceFixture()
    const response = deferred<any>()
    fixture.request.mockImplementationOnce(() => response.promise)
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    void session.docs.get('a:b')
    await vi.waitFor(() => expect(fixture.request).toHaveBeenCalled())
    await session.dispose()
    response.reject(new Error('Late abandoned content failure'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(session.getSnapshot().status).toBe('disposed')
  })

  it('cancels captured work before adapter dispatch without automatic retry', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b' })
    const controller = new AbortController()
    const run = session.tests.run({ mode: 'server', signal: controller.signal })
    controller.abort()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.request).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('keeps explicit settings made before connection ahead of source defaults', async () => {
    const fixture = sourceFixture()
    fixture.connection.initialSettings = { colorScheme: 'light', textDirection: 'rtl' }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.settings.update({ colorScheme: 'dark' })
    await session.connect()
    expect(session.getSnapshot().settings).toMatchObject({ colorScheme: 'dark', textDirection: 'rtl' })
    await session.dispose()
  })
})
