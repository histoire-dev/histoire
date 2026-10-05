import { describe, expect, it } from 'vitest'
import { createParentViewSession } from '../../../histoire-app/src/embed/view-session.js'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'

describe('parent-backed retained events', () => {
  it('keeps stream-owned history/loss across stripped snapshot sync and clears explicitly', () => {
    const view = createParentViewSession({} as any, new AbortController().signal)
    const snapshot = createEmbedSnapshot()
    snapshot.selection = { storyId: 'a:b', variantId: 'c' }
    snapshot.runtime.runtimeId = 'current'
    view.synchronize(snapshot)
    view.clearEvents(5)
    view.event({ sequence: 1, timestamp: 1, target: snapshot.selection, runtimeId: 'current', payload: { name: 'saved' } })
    view.synchronize({ ...snapshot, events: { items: [], droppedCount: 7 } })
    expect(view.session.getSnapshot().events).toMatchObject({ droppedCount: 5, items: [{ sequence: 1 }] })
    view.dropEvents(2)
    expect(view.session.getSnapshot().events.droppedCount).toBe(7)
    view.event({ sequence: 2, timestamp: 2, target: snapshot.selection, runtimeId: 'retired', payload: {} })
    expect(view.session.getSnapshot().events.items).toHaveLength(1)
    view.clearEvents()
    expect(view.session.getSnapshot().events).toEqual({ items: [], droppedCount: 0 })
    view.close()
  })
})
