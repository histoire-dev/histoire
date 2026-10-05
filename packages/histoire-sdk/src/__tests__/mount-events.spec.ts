import { describe, expect, it, vi } from 'vitest'
import { createMountEventStream } from '../mounts/events.js'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { sourceFixture } from './fixtures/session.js'

describe('retained event surface stream', () => {
  it('replays bounded retained items then future events once, resets on clear and stops after close', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount({} as any, { surface: 'grid' })
    await primary.ready
    for (let index = 0; index < 70; index++) fixture.emitEvent(index)
    const publish = vi.fn()
    const close = createMountEventStream(session, publish)
    expect(publish.mock.calls[0][0]).toEqual({ reset: true, items: [] })
    expect(publish.mock.calls.slice(1).map(([payload]) => payload.items.length)).toEqual([32, 32, 6])
    expect(publish.mock.calls[1][1]).toMatchObject({ runtimeId: 'document-1', target: { storyId: 'a:b', variantId: 'c' } })
    fixture.emitEvent(71)
    expect(publish.mock.lastCall![0].items).toHaveLength(1)
    session.events.clear()
    expect(publish.mock.lastCall![0]).toEqual({ reset: true, items: [] })
    close()
    const count = publish.mock.calls.length
    fixture.emitEvent(72)
    expect(publish).toHaveBeenCalledTimes(count)
    await session.dispose()
  })

  it('accepts attributable non-selected grid events and rejects retired documents and ambiguous variants', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as any, { surface: 'grid' }).ready
    const listener = vi.fn()
    const stop = session.events.subscribe(listener)
    const event = { sequence: 1, timestamp: 1, target: { storyId: 'a:b', variantId: 'other' }, runtimeId: 'document-1', payload: { name: 'other', argument: { count: 1 } } }
    for (const receive of fixture.frameListeners) receive({ type: 'event', ...fixture.owner(), event })
    expect(listener).toHaveBeenCalledOnce()
    expect(session.getSnapshot().events.items[0].target).toEqual(event.target)
    fixture.reload()
    fixture.ready()
    for (const receive of fixture.frameListeners) receive({ type: 'event', ...fixture.owner(), runtimeId: 'document-1', event })
    expect(listener).toHaveBeenCalledOnce()
    stop()
    await session.dispose()
  })

  it('replays current retained loss then sends only future loss deltas', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as any, { surface: 'preview' }).ready
    for (const receive of fixture.frameListeners) receive({ type: 'dropped', ...fixture.owner(), count: 5 })
    const publish = vi.fn()
    const close = createMountEventStream(session, publish)
    expect(publish.mock.lastCall![0]).toEqual({ items: [], reset: true, droppedCount: 5 })
    for (const receive of fixture.frameListeners) receive({ type: 'dropped', ...fixture.owner(), count: 2 })
    expect(publish.mock.lastCall![0]).toEqual({ items: [], droppedCount: 2 })
    session.events.clear()
    expect(publish.mock.lastCall![0]).toEqual({ items: [], reset: true })
    close()
    await session.dispose()
  })
})
