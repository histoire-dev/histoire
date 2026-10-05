import { MessageChannel } from 'node:worker_threads'
import { createHistoireSessionWithAdapters, subscribeHistoireMountEvents } from '@histoire/sdk/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExplorerViewSession } from '../../../histoire-app/src/embed/adapters/explorer-session.js'
import { registerEmbedSurface } from '../../../histoire-app/src/embed/surfaces.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('explorer nested primary focus ownership', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('keeps outer mount identity when native child receives current source-frame search intent', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel)
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const container = document.createElement('div')
    document.body.append(container)
    const outer = session.mount(container, { surface: 'preview' })
    await outer.ready
    let postFocus = () => {}
    const remove = registerEmbedSurface('preview', (context) => {
      postFocus = () => context.bridge.post('focus.changed', { focused: true, action: 'search' }, { runtimeId: session.getSnapshot().runtime.runtimeId!, target: session.getSnapshot().selection! })
      return { ready: Promise.resolve(session.getSnapshot().runtime), close: () => {} }
    })
    const owner = createExplorerViewSession({ container, session, descriptor: fixture.descriptor, signal: new AbortController().signal, bridge: { getOwner: () => ({ ...fixture.descriptor, protocolVersion: 1, sessionId: 'session', mountId: outer.id, connectionId: 'outer', sourceId: fixture.descriptor.sourceId }), post: vi.fn() } as any })
    try {
      const child = owner.session.mount(container, { surface: 'preview' })
      const focus = vi.fn()
      subscribeHistoireMountEvents(child, focus)
      await child.ready
      postFocus()
      await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce())
      expect(child.id).toBe(outer.id)
    }
    finally {
      await owner.close()
      await session.dispose()
      remove()
      container.remove()
    }
  })
})
