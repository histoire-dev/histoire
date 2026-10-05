import type { HistoireBridgeIdentity, HistoireRuntimeSnapshot } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'

/** One primary document whose failure must not release its attachment. */
const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'preview', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'document', target: { storyId: 'a:b', variantId: 'c' } }

/** Portable lifecycle publication retains the failing document's identity. */
function runtime(status: HistoireRuntimeSnapshot['status'], runtimeId = owner.runtimeId!): HistoireRuntimeSnapshot {
  return { status, mountId: owner.mountId, runtimeId, layout: 'single', viewports: [], viewport: null }
}

describe('primary document authority', () => {
  it.each([
    ['failed', 'selection.select'],
    ['failed', 'view.sync'],
    ['stale', 'selection.select'],
    ['stale', 'view.sync'],
  ] as const)('retires same-ID %s document and permits %s replacement', async (status, command) => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch: () => null })
    const notifications: HistoireRuntimeSnapshot[] = []
    parent.subscribe((value) => {
      if (value.type === 'runtime') notifications.push(value.runtime)
    })
    const pending = parent.request('state.get', {}, { ...owner, signal: new AbortController().signal })
    // Failed/stale can retain documentId for attribution; that ID still retires.
    child.post('readiness.changed', { runtime: runtime(status) })
    await Promise.resolve()
    ports.child.postMessage({ ...child.getOwner(), kind: 'request', requestId: 'retired-intent', command: 'selection.select', payload: { storyId: 'a', variantId: 'b:c' } })
    // Bypass sender checks to prove receiver rejects correctly attributed old traffic.
    ports.child.postMessage({ ...child.getOwner(), kind: 'event', event: 'readiness.changed', sequence: 100, payload: { runtime: runtime('ready') } })
    await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
    expect(notifications.map(value => value.status)).toEqual([status])
    await expect(pending).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    // Replacement commands may name predecessor owner; its late readiness cannot.
    const target = { storyId: 'a', variantId: 'b:c' }
    const payload = command === 'view.sync' ? { ...createEmbedSnapshot(), selection: target } : target
    await expect(parent.request(command, payload, { ...parent.getOwner(), ...(command === 'selection.select' ? { target } : {}), signal: new AbortController().signal })).resolves.toBeNull()
    child.post('readiness.changed', { runtime: runtime('ready', 'replacement') }, { runtimeId: 'replacement', target })
    await Promise.resolve()
    expect(notifications.map(value => value.runtimeId)).toEqual(['document', 'replacement'])
    expect(parent.getOwner().runtimeId).toBe('replacement')
    parent.close()
    child.close()
  })
})
