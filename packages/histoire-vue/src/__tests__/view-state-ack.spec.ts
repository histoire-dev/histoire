import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createParentViewSession } from '../../../histoire-app/src/embed/view-session.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { dispatchHistoireSessionCommand } from '../../../histoire-sdk/src/transport/session-commands.js'

describe('parent-backed state acknowledgment', () => {
  it('returns canonical wire state while public mutations stay void and source mirror updates', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    await session.state.get()
    const snapshot = session.getSnapshot()
    const bridge = { getOwner: () => ({ sourceId: snapshot.source!.sourceId, epoch: snapshot.source!.epoch, revision: snapshot.source!.revision }), request: vi.fn((command, payload, capture) => dispatchHistoireSessionCommand(session, command, payload, capture)) }
    const view = createParentViewSession(bridge as any, new AbortController().signal)
    view.synchronize(snapshot as any)
    try {
      await expect(view.session.state.patch({ count: 12 })).resolves.toBeUndefined()
      expect(view.session.getSnapshot().state?.value.count).toBe(12)
      expect(session.getSnapshot().state?.value.count).toBe(12)
      await expect(view.session.state.reset()).resolves.toBeUndefined()
      expect(view.session.getSnapshot().state?.value.count).toBe(5)
    }
    finally {
      view.close()
      await session.dispose()
    }
  })

  it('rejects late acknowledgment rather than updating replacement document mirror', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(document.createElement('div'), { surface: 'preview' })
    await primary.ready
    const snapshot = session.getSnapshot()
    const operation = deferred<any>()
    const bridge = { getOwner: () => ({ sourceId: snapshot.source!.sourceId, epoch: snapshot.source!.epoch, revision: snapshot.source!.revision }), request: () => operation.promise }
    const view = createParentViewSession(bridge as any, new AbortController().signal)
    view.synchronize(snapshot as any)
    const patch = view.session.state.patch({ count: 99 })
    view.synchronize({ ...snapshot, runtime: { ...snapshot.runtime, runtimeId: 'replacement' }, state: null } as any)
    operation.resolve({ ...fixture.state(), value: { count: 99 } })
    try {
      await expect(patch).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
      expect(view.session.getSnapshot().runtime.runtimeId).toBe('replacement')
      expect(view.session.getSnapshot().state).toBeNull()
    }
    finally {
      view.close()
      await session.dispose()
    }
  })
})
