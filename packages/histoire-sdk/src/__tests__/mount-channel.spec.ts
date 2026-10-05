import type { HistoireBridgePublication } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { bindHistoireMountChannel } from '../mounts/channel.js'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { sourceFixture } from './fixtures/session.js'

describe('internal controls channel ownership', () => {
  it('unwinds transport when channel subscribe fails', async () => {
    const fixture = sourceFixture()
    const original = fixture.adapters.mount!
    fixture.adapters.mount = context => ({ ...original(context), channel: { subscribe() {
      throw new Error('channel subscribe failed')
    }, post() {} } })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    expect(() => session.mount({} as HTMLElement, { surface: 'preview' })).toThrow('channel subscribe failed')
    await vi.waitFor(() => expect(fixture.surfaceClose).toHaveBeenCalledOnce())
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
  })

  it('attempts observer and transport teardown when channel unsubscribe throws', async () => {
    const fixture = sourceFixture()
    const original = fixture.adapters.mount!
    const observer = vi.fn()
    fixture.adapters.mount = context => ({ ...original(context), subscribe: () => observer, channel: { subscribe: () => () => {
      throw new Error('channel close failed')
    }, post() {} } })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const primary = session.mount({} as HTMLElement, { surface: 'preview' })
    await primary.ready
    await expect(primary.unmount()).rejects.toThrow('channel close failed')
    expect(observer).toHaveBeenCalledOnce()
    expect(fixture.surfaceClose).toHaveBeenCalledOnce()
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
  })

  it('shares finite channel across SDK copies, drops stale documents and detaches late publications', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount({} as HTMLElement, { surface: 'preview' })
    await primary.ready
    let receive = (_event: HistoireBridgePublication) => {}
    const post = vi.fn()
    const unsubscribe = vi.fn()
    const handle = { id: 'controls-mount', ready: Promise.resolve(), unmount: async () => {} }
    const close = bindHistoireMountChannel(handle, session, { subscribe(listener) {
      receive = listener
      return unsubscribe
    }, post })
    const listener = vi.fn()
    vi.resetModules()
    const peer = await import('../mounts/channel.js')
    peer.subscribeHistoireMountEvents(handle, listener)
    const snapshot = session.getSnapshot()
    const event: HistoireBridgePublication = { protocolVersion: 1, sessionId: 'session', connectionId: 'controls-port', mountId: handle.id, sourceId: snapshot.source!.sourceId, epoch: snapshot.source!.epoch, revision: snapshot.source!.revision, runtimeId: snapshot.runtime.runtimeId!, target: snapshot.selection!, kind: 'event', event: 'overlay.open', sequence: 0, payload: { id: 'menu', anchor: { x: 0, y: 0, width: 20, height: 20 }, overlay: { kind: 'select', items: [{ id: 'choice', label: 'Choice' }] } } }
    receive({ ...event, runtimeId: 'retired-document' })
    receive(event)
    expect(listener).toHaveBeenCalledOnce()
    peer.postHistoireMountEvent(handle, 'overlay.result', { id: 'menu', itemId: 'choice', restoreFocus: true })
    expect(post).toHaveBeenCalledOnce()
    close()
    receive(event)
    peer.postHistoireMountEvent(handle, 'overlay.result', { id: 'menu', restoreFocus: true })
    expect(listener).toHaveBeenCalledOnce()
    expect(post).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
    await session.dispose()
  })
})
