import type { SessionContextSource } from '../index.js'
import { describe, expect, it, vi } from 'vitest'
import { createSessionContext } from '../index.js'

/** Session double publishing snapshots on demand. */
function createSession() {
  const listeners = new Set<() => void>()
  let snapshot = { source: { url: 'https://book.example/', sourceId: 'book', epoch: 'e1' }, selection: { storyId: 'story', variantId: 'one' }, catalog: { stories: [] } }
  const session: SessionContextSource = {
    getSnapshot: () => snapshot as never,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    catalog: { list: async () => [], getStory: async () => ({}) as never, search: async () => [] },
  }
  /**
   * Publishes a snapshot with some fields replaced.
   * @param patch Replaced fields.
   */
  const publish = (patch: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  return { session, publish }
}

describe('session catalog changes', () => {
  it('notifies catalog subscribers once per catalog publication only', () => {
    const { session, publish } = createSession()
    const root = createSessionContext({ session })
    const listener = vi.fn()
    const stop = root.context.catalog.subscribe!(listener)
    publish({ selection: { storyId: 'story', variantId: 'two' } })
    expect(listener).not.toHaveBeenCalled()
    publish({ catalog: { stories: [] } })
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    publish({ catalog: { stories: [] } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('isolates throwing catalog listeners from other listeners and selection changes', () => {
    const { session, publish } = createSession()
    const root = createSessionContext({ session })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const signal = root.selectionSignal()
    const after = vi.fn()
    const contextListener = vi.fn()
    root.context.catalog.subscribe!(() => {
      throw new Error('boom')
    })
    root.context.catalog.subscribe!(after)
    root.context.subscribe(contextListener)
    publish({ catalog: { stories: [] }, selection: { storyId: 'story', variantId: 'two' } })
    expect(after).toHaveBeenCalledOnce()
    expect(contextListener).toHaveBeenCalledOnce()
    expect(signal.aborted).toBe(true)
    expect(root.context.selection.target?.variantId).toBe('two')
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('stops notifying once the context closes', () => {
    const { session, publish } = createSession()
    const root = createSessionContext({ session })
    const listener = vi.fn()
    root.context.catalog.subscribe!(listener)
    root.close()
    publish({ catalog: { stories: [] } })
    expect(listener).not.toHaveBeenCalled()
  })
})
