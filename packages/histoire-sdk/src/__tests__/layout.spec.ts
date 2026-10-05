import { describe, expect, it } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { sourceFixture } from './fixtures/session.js'

describe('dedicated runtime layout publications', () => {
  it('replaces current geometry without replaying readiness and drops retired layout', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const mount = session.mount({} as HTMLElement, { surface: 'preview' })
    await mount.ready
    const viewport = { target: { storyId: 'a:b', variantId: 'c' }, x: 10, y: 20, width: 300, height: 200, scale: 1, visibleRect: { x: 10, y: 20, width: 200, height: 100 } }
    for (const listener of fixture.frameListeners) listener({ type: 'layout', ...fixture.owner(), viewports: [viewport] })
    expect(session.getSnapshot().runtime).toMatchObject({ status: 'ready', runtimeId: 'document-1', viewports: [viewport], viewport })
    for (const listener of fixture.frameListeners) listener({ type: 'layout', ...fixture.owner(), runtimeId: 'retired', viewports: [] })
    expect(session.getSnapshot().runtime.viewports).toEqual([viewport])
    for (const listener of fixture.frameListeners) listener({ type: 'layout', ...fixture.owner(), viewports: [] })
    expect(session.getSnapshot().runtime.viewport).toBeNull()
    await session.dispose()
  })
})
