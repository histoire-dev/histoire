import type { HistoireStateSnapshot } from '@histoire/protocol'
import { createDefaultHistoireSettings } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedControlsReplica } from '../../../histoire-app/src/embed/adapters/controls-replica.js'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Source-owned replica with delayed canonical acknowledgment and stale proxy mirror. */
function replicaFixture() {
  const operation = deferred<HistoireStateSnapshot>()
  let closed = false
  const target = { storyId: 'story', variantId: 'variant' }
  const snapshot = { runtime: { status: 'ready', runtimeId: 'primary' }, selection: target, settings: createDefaultHistoireSettings(), state: { target, runtimeId: 'primary', value: { expanded: true } as Record<string, unknown> } }
  const getSnapshot = vi.fn(() => {
    if (closed) throw new Error('closed parent')
    return snapshot
  })
  const container = document.createElement('div')
  document.body.append(container)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const post = vi.fn()
  let synchronize = () => {}
  const context = { container, descriptor: { config: { theme: {} } }, session: { getSnapshot, subscribe: (listener: () => void) => {
    synchronize = listener
    return () => {}
  }, state: { patch: vi.fn(() => operation.promise) } }, bridge: { getOwner: () => ({ mountId: 'controls' }), post } }
  const replica = createEmbedControlsReplica(context as any, () => {})
  const iframe = container.querySelector('iframe')!
  vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 420, 220))
  Object.defineProperties(iframe, { clientWidth: { get: () => 420 }, clientHeight: { get: () => 220 } })
  const documentId = new URL(iframe.src).searchParams.get('documentId')
  const childPost = vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(() => {})
  /** Sandbox messages carry exact frame/origin/document/target ownership. */
  function dispatch(type: string, extra = {}) {
    window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow!, origin: location.origin, data: { __histoire: true, type, documentId, ...target, ...extra } }))
  }
  return { operation, snapshot, getSnapshot, context, replica, post, childPost, dispatch, synchronize: () => synchronize(), closeParent: () => {
    closed = true
  }, close() {
    replica.close()
    container.remove()
    vi.unstubAllGlobals()
  } }
}

describe('source controls replica acquisition', () => {
  it('keeps newer local typing while older canonical acknowledgments arrive', async () => {
    const fixture = replicaFixture()
    const second = deferred<HistoireStateSnapshot>()
    fixture.context.session.state.patch.mockReturnValueOnce(fixture.operation.promise).mockReturnValueOnce(second.promise)
    try {
      fixture.dispatch('__histoire:controls-ready', { hasControls: true })
      await fixture.replica.ready
      fixture.childPost.mockClear()
      fixture.dispatch('__histoire:state-sync', { state: { expanded: true, text: 'F' }, controlsRevision: 1 })
      fixture.dispatch('__histoire:state-sync', { state: { expanded: true, text: 'Fo' }, controlsRevision: 2 })
      fixture.snapshot.state.value = { expanded: true, text: 'F' }
      fixture.synchronize()
      fixture.operation.resolve(fixture.snapshot.state)
      await fixture.operation.promise
      await Promise.resolve()
      expect(fixture.childPost.mock.calls.filter(([value]) => value.type === '__histoire:state-sync')).toHaveLength(0)
      fixture.snapshot.state.value = { expanded: true, text: 'Fo' }
      fixture.synchronize()
      second.resolve(fixture.snapshot.state)
      await second.promise
      await vi.waitFor(() => {
        const states = fixture.childPost.mock.calls.filter(([value]) => value.type === '__histoire:state-sync')
        expect(states.at(-1)?.[0].state.text).toBe('Fo')
        expect(states.at(-1)?.[0].controlsRevision).toBe(2)
      })
    }
    finally { fixture.close() }
  })

  it('rejects invalid, replayed and retired controls edit revisions', async () => {
    const fixture = replicaFixture()
    try {
      fixture.dispatch('__histoire:controls-ready', { hasControls: true })
      await fixture.replica.ready
      fixture.dispatch('__histoire:state-sync', { state: { expanded: true }, controlsRevision: 1 })
      await Promise.resolve()
      expect(fixture.context.session.state.patch).toHaveBeenCalledOnce()
      for (const controlsRevision of [0, 1, -1, 0.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
        fixture.dispatch('__histoire:state-sync', { state: { expanded: true }, controlsRevision })
      }
      fixture.snapshot.runtime.runtimeId = 'replacement'
      fixture.synchronize()
      // WindowProxy survives navigation, but old document cannot mint new edits.
      fixture.dispatch('__histoire:state-sync', { state: { expanded: false }, controlsRevision: 2 })
      await Promise.resolve()
      expect(fixture.context.session.state.patch).toHaveBeenCalledOnce()
      fixture.operation.resolve(fixture.snapshot.state)
      await fixture.operation.promise
    }
    finally { fixture.close() }
  })

  it('distinguishes opening from updates and never resurrects resolved overlay IDs', async () => {
    const fixture = replicaFixture()
    try {
      fixture.dispatch('__histoire:controls-ready', { hasControls: true })
      await fixture.replica.ready
      const value = { id: 'menu', anchor: { x: 5, y: 10, width: 100, height: 20 }, overlay: { kind: 'select', items: [{ id: 'choice', label: 'Choice' }] } }
      fixture.dispatch('__histoire:controls-overlay', value)
      expect(fixture.post.mock.calls.at(-1)?.[0]).toBe('overlay.open')
      fixture.replica.publication({ event: 'overlay.result', runtimeId: 'primary', target: fixture.snapshot.selection, payload: { id: 'menu', itemId: 'choice', restoreFocus: true } } as any)
      fixture.post.mockClear()
      fixture.dispatch('__histoire:controls-overlay', value)
      expect(fixture.post).not.toHaveBeenCalled()
      fixture.dispatch('__histoire:controls-overlay', { ...value, id: 'replacement' })
      expect(fixture.post.mock.calls.at(-1)?.[0]).toBe('overlay.open')
      window.dispatchEvent(new Event('resize'))
      expect(fixture.post.mock.calls.at(-1)?.[0]).toBe('overlay.update')
    }
    finally { fixture.close() }
  })

  it('observes pending replica edits after teardown without reading closed parent session', async () => {
    const fixture = replicaFixture()
    try {
      fixture.dispatch('__histoire:controls-ready', { hasControls: true })
      await fixture.replica.ready
      fixture.dispatch('__histoire:state-sync', { state: { count: 8 } })
      fixture.replica.close()
      const reads = fixture.getSnapshot.mock.calls.length
      fixture.closeParent()
      fixture.operation.resolve(fixture.snapshot.state)
      await fixture.operation.promise
      await Promise.resolve()
      expect(fixture.getSnapshot).toHaveBeenCalledTimes(reads)
    }
    finally { fixture.close() }
  })

  it('unsubscribes acquired session and listeners when observer startup fails', () => {
    const off = vi.fn()
    const disconnect = vi.fn()
    const remove = vi.spyOn(window, 'removeEventListener')
    vi.stubGlobal('ResizeObserver', class {
      observe() {
        throw new Error('observer startup failed')
      }

      disconnect = disconnect
    })
    const context = { container: document.createElement('div'), session: { subscribe: () => off, getSnapshot: () => ({ runtime: { status: 'absent' } }) } }
    try {
      expect(() => createEmbedControlsReplica(context as any, () => {})).toThrow('observer startup failed')
      expect(off).toHaveBeenCalledOnce()
      expect(disconnect).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledWith('message', expect.any(Function))
      expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    }
    finally {
      remove.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
