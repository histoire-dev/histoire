// @vitest-environment jsdom
import type { EmbedSurfaceContext } from '../../../../../histoire-app/src/embed/surfaces.js'
import type { HistoireRequestCapture } from '../../../../../histoire-sdk/src/adapters/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountLocalHistoireSurface } from '../../../../../histoire-app/src/embed/adapters/local-mount.js'
import { sourceFixture } from '../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../../histoire-sdk/src/internal.js'
import { createBridgePort } from '../../../../../histoire-sdk/src/transport/port.js'
import { createEmbedSnapshot } from '../utils/embed/catalog.js'
import { createEmbedPortPair } from '../utils/embed/transport.js'

const surface = vi.hoisted(() => ({ contexts: [] as EmbedSurfaceContext[], observe: false, request: vi.fn((_command: string, _payload: unknown, _capture: HistoireRequestCapture): unknown => null) }))
vi.mock('../../../../../histoire-app/src/embed/surfaces.js', () => ({
  mountEmbedSurface: (_name: string, context: EmbedSurfaceContext) => {
    surface.contexts.push(context)
    /** Direct runtime observer publishes before native MessageChannel can deliver queued intent. */
    const publish = () => {
      const target = context.session.getSnapshot().selection
      if (surface.observe && target?.variantId) context.bridge.post('readiness.changed', { runtime: { status: 'ready', mountId: context.bridge.getOwner().mountId, runtimeId: 'local-document', layout: 'grid', viewports: [], viewport: null } }, { runtimeId: 'local-document', target })
    }
    const stop = context.session.subscribe(publish)
    publish()
    return { ready: Promise.resolve(), request: surface.request, close: stop }
  },
}))

describe('nested local port capture', () => {
  beforeEach(() => {
    surface.observe = false
    surface.contexts.length = 0
    surface.request.mockReset().mockReturnValue(null)
  })
  afterEach(() => {
    surface.observe = false
  })
  it('recaptures inner port identity after outer generation diverges while retaining runtime/source checks', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    const container = document.createElement('div')
    document.body.append(container)
    const inner = mountLocalHistoireSurface({ session, sessionId: 'session', mountId: 'inner', surface: 'preview', hidden: false, container, source: fixture.connection, target: null, settings: fixture.defaults }, 'https://book.test/')
    const ports = createEmbedPortPair()
    const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'outer-connection', mountId: 'outer', sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision }
    const signal = new AbortController().signal
    const target = { storyId: 'a:b', variantId: 'c' }
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch: (request, signal) => request.command === 'view.sync' ? null : inner.request(request.command, request.payload, { ...request, signal }) })
    try {
      await inner.ready
      for (const selection of [target, { storyId: 'a:b', variantId: 'other' }, target]) {
        await parent.request('view.sync', { ...createEmbedSnapshot(), selection }, { ...parent.getOwner(), signal })
      }
      expect(parent.getOwner().selectionVersion).toBe(3)
      await expect(parent.request('selection.select', target, { ...parent.getOwner(), signal })).resolves.toBeNull()
      expect(surface.request).toHaveBeenLastCalledWith('selection.select', target, expect.objectContaining({ selectionVersion: 0, connectionId: inner.id, mountId: 'inner', target }))
      expect(() => inner.request('state.get', {}, { ...parent.getOwner(), target: { ...target, variantId: 'other' }, signal })).toThrow('Mismatched runtime target')
      expect(() => inner.request('state.get', {}, { ...parent.getOwner(), revision: 'old', signal })).toThrow('Mismatched bridge owner/version')
      // Outer response keeps its own generation; local recapture never rewrites it.
      expect(ports.child.sent).toContainEqual(expect.objectContaining({ kind: 'response', selectionVersion: 3, connectionId: owner.connectionId, mountId: owner.mountId }))
    }
    finally {
      parent.close()
      child.close()
      await inner.close()
      container.remove()
      await session.dispose()
    }
  })

  it('keeps queued local endpoints aligned through initial and subsequent direct runtime selections', async () => {
    surface.observe = true
    surface.request.mockImplementation((command, payload, capture) => command === 'controls.preset' ? { items: [] } : command === 'state.patch' ? { target: capture.target, runtimeId: capture.runtimeId, value: payload } : null)
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    const container = document.createElement('div')
    document.body.append(container)
    const inner = mountLocalHistoireSurface({ session, sessionId: 'local-session', mountId: 'local', surface: 'grid', hidden: false, container, source: fixture.connection, target: null, settings: fixture.defaults }, 'https://book.test/')
    const signal = new AbortController().signal
    try {
      await inner.ready
      for (const [variantId, selectionVersion] of [['c', 1], ['other', 2], ['c', 3]] as const) {
        const target = { storyId: 'a:b', variantId }
        // Child UI echo keeps its captured predecessor reply through local sync.
        const bridge = surface.contexts[0].bridge
        if (variantId === 'other') await bridge.request('selection.select', target, { ...bridge.getOwner(), signal })
        else await session.selection.select(target)
        const capture = { sessionId: 'local-session', connectionId: inner.id, sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, target, signal }
        await inner.request('selection.select', target, capture)
        await expect(inner.request('state.patch', { count: selectionVersion }, { ...capture, runtimeId: 'local-document' })).resolves.toMatchObject({ value: { count: selectionVersion } })
        await expect(inner.request('controls.preset', { action: 'list' }, { ...capture, runtimeId: 'local-document' })).resolves.toEqual({ items: [] })
        expect(surface.contexts[0].bridge.getOwner().selectionVersion).toBe(selectionVersion)
        expect(surface.request).toHaveBeenLastCalledWith('controls.preset', { action: 'list' }, expect.objectContaining({ selectionVersion, target }))
      }
      const bridge = surface.contexts[0].bridge
      expect(() => bridge.synchronizeSelection(session.getSnapshot().selection, { ...bridge.getOwner(), mountId: 'foreign' })).toThrow('Mismatched local surface authority')
      expect(() => inner.request('state.get', {}, { ...bridge.getOwner(), runtimeId: 'old-document', signal })).toThrow('Mismatched runtime owner')
    }
    finally {
      await inner.close()
      container.remove()
      await session.dispose()
    }
  })
})
