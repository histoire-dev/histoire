import type { HistoireBridgeIdentity, HistoireBridgeRequest } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedDescriptor, createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'

/** Queued source publication still belongs to this port after host target changes. */
const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'preview', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'document', target: { storyId: 'a:b', variantId: 'c' } }
const target = { storyId: 'a:b', variantId: 'other' }

describe('source publication authority', () => {
  it.each(['fixture', 'native'] as const)('resynchronizes target, generation and runtime after concurrent catalog publication (%s)', async (mode) => {
    const channel = mode === 'native' ? new MessageChannel() : undefined
    const ports = channel ? { parent: channel.port1, child: channel.port2 } : createEmbedPortPair()
    const descriptor = createEmbedDescriptor()
    descriptor.revision = 'revision-2'
    const signal = new AbortController().signal
    const intents = vi.fn(() => null)
    let child: ReturnType<typeof createBridgePort>
    const dispatch = vi.fn((request: HistoireBridgeRequest) => {
      if (request.command === 'view.sync') {
        child.post('readiness.changed', { runtime: { status: 'ready', mountId: owner.mountId, runtimeId: 'replacement', layout: 'grid', viewports: [], viewport: null } }, { runtimeId: 'replacement', target })
        return null
      }
      if (request.command === 'state.patch') return { target, runtimeId: request.runtimeId, value: request.payload }
      return null
    })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch: intents })
    child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch })
    const notifications = vi.fn()
    parent.subscribe(notifications)
    try {
      // HMR can also replace child document before its publications reach host.
      child.post('readiness.changed', { runtime: { status: 'ready', mountId: owner.mountId, runtimeId: 'unseen-document', layout: 'grid', viewports: [], viewport: null } }, { runtimeId: 'unseen-document' })
      child.post('catalog.changed', { descriptor }, { revision: descriptor.revision })
      const oldSync = parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal })
      const settled = oldSync.then(() => null, error => error)
      // Source data bridge can update controller, but only this publication can
      // update surface port's revision before canonical snapshot resynchronizes.
      await vi.waitFor(() => expect(parent.getOwner().revision).toBe(descriptor.revision), { timeout: 500 })
      await expect(settled).resolves.toMatchObject({ code: 'STALE_REVISION' })
      expect(parent.getOwner().target).toEqual(target)
      expect(parent.getOwner().selectionVersion).toBe(1)
      expect(child.getOwner().target).toEqual(owner.target)
      expect(child.getOwner().selectionVersion).toBe(0)
      expect(notifications).toHaveBeenCalledWith(expect.objectContaining({ type: 'catalog', revision: descriptor.revision }))

      const snapshot = { ...createEmbedSnapshot(), source: { ...createEmbedSnapshot().source!, revision: descriptor.revision }, selection: target }
      await expect(parent.request('view.sync', snapshot, { ...parent.getOwner(), signal })).resolves.toBeNull()
      expect(child.getOwner()).toMatchObject({ target, selectionVersion: 1, revision: descriptor.revision, runtimeId: 'replacement' })
      await expect(parent.request('state.patch', { count: 2 }, { ...parent.getOwner(), signal })).resolves.toMatchObject({ target, runtimeId: 'replacement', value: { count: 2 } })
      await expect(parent.request('settings.update', { rotate: true }, { ...parent.getOwner(), signal })).resolves.toBeNull()
      expect(dispatch.mock.calls.map(([request]) => request.command)).toEqual(['view.sync', 'state.patch', 'settings.update'])

      // Source catch-up never makes predecessor document/selection intent valid.
      ports.child.postMessage({ ...owner, revision: descriptor.revision, kind: 'request', requestId: 'stale-intent', command: 'selection.select', payload: target, selectionVersion: 0 })
      for (const selectionVersion of [0, { valueOf: 'invalid', toString: 'invalid' }]) {
        ports.parent.postMessage({ ...owner, revision: descriptor.revision, kind: 'request', requestId: 'stale-parent-sync', command: 'view.sync', payload: { ...snapshot, selection: owner.target }, selectionVersion })
      }
      await parent.request('settings.update', { rotate: false }, { ...parent.getOwner(), signal })
      expect(intents).not.toHaveBeenCalled()
      expect(dispatch.mock.calls.filter(([request]) => request.command === 'view.sync')).toHaveLength(1)
      expect(child.getOwner()).toMatchObject({ target, selectionVersion: 1 })
    }
    finally {
      parent.close()
      child.close()
    }
  })

  it.each(['protocolVersion', 'sessionId', 'connectionId', 'mountId', 'sourceId', 'epoch'] as const)('rejects catalog publication with foreign %s despite target relaxation', async (key) => {
    const ports = createEmbedPortPair()
    const descriptor = createEmbedDescriptor()
    descriptor.revision = 'revision-2'
    if (key === 'sourceId' || key === 'epoch') descriptor[key] = 'foreign'
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    ports.child.start()
    const notifications = vi.fn()
    parent.subscribe(notifications)
    try {
      ports.child.postMessage({ ...owner, [key]: key === 'protocolVersion' ? 2 : 'foreign', runtimeId: 'other-document', target, revision: descriptor.revision, kind: 'event', event: 'catalog.changed', sequence: 1, payload: { descriptor } })
      await Promise.resolve()
      expect(parent.getOwner().revision).toBe(owner.revision)
      expect(notifications).not.toHaveBeenCalled()
    }
    finally {
      parent.close()
      ports.child.close()
    }
  })

  it('observes source disconnect even when queued publication retains preceding target', async () => {
    const ports = createEmbedPortPair()
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch: () => null })
    const notifications = vi.fn()
    parent.subscribe(notifications)
    try {
      child.post('source.disconnected', {})
      const syncing = parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal: new AbortController().signal })
      await expect(syncing).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
      expect(notifications).toHaveBeenCalledWith(expect.objectContaining({ type: 'runtime', runtime: expect.objectContaining({ status: 'stale' }) }))
    }
    finally {
      parent.close()
      child.close()
    }
  })
})
