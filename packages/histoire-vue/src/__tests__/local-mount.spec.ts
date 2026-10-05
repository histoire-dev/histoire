import { MessageChannel } from 'node:worker_threads'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountLocalHistoireSurface } from '../../../histoire-app/src/embed/adapters/local-mount.js'
import { registerEmbedSurface } from '../../../histoire-app/src/embed/surfaces.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('first-party local mounting', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reuses finite runtime dispatch without embed discovery and joins delayed teardown', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel)
    const fixture = sourceFixture()
    const released = deferred<void>()
    const teardown = vi.fn(() => released.promise)
    const remove = registerEmbedSurface('preview', (context) => {
      const runtime = { ...fixture.runtime(), mountId: context.bridge.getOwner().mountId }
      context.bridge.post('readiness.changed', { runtime }, { runtimeId: runtime.runtimeId, target: fixture.state().target })
      return { ready: Promise.resolve(runtime), request: (command, payload) => command === 'settings.update' ? null : fixture.request(command, payload), close: teardown }
    })
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, { ...fixture.adapters, mount: context => mountLocalHistoireSurface(context, 'https://book.example/') })
    const element = document.createElement('div')
    document.body.append(element)
    try {
      await session.connect()
      await session.selection.select({ storyId: 'a:b', variantId: 'c' })
      const handle = session.mount(element, { surface: 'preview' })
      await handle.ready
      await session.state.patch({ count: 17 })
      expect((await session.state.get()).value.count).toBe(17)
      const pending = handle.unmount()
      await vi.waitFor(() => expect(teardown).toHaveBeenCalledOnce())
      expect(() => session.mount(element, { surface: 'preview' })).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
      released.resolve()
      await pending
      expect(element.children).toHaveLength(0)
      expect(session.getSnapshot().status).toBe('ready')
    }
    finally {
      released.resolve()
      await session.dispose()
      remove()
      element.remove()
    }
  })
})
