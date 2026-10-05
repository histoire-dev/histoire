import type { HistoireBridgeIdentity } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedSnapshot } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'

const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'preview', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'document', target: { storyId: 'a:b', variantId: 'c' } }

describe('selection intent authority', () => {
  it('ends echo correlation before async ACK so later host navigation settles accepted intent', async () => {
    const ports = createEmbedPortPair()
    const target = { storyId: 'a:b', variantId: 'other' }
    let release!: () => void
    let echo!: Promise<unknown>
    const delay = new Promise<void>((resolve) => {
      release = resolve
    })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'view', dispatch: () => {
      echo = parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal: new AbortController().signal })
      return delay
    } })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'view', child: true, dispatch: () => null })
    try {
      const intent = child.request('selection.select', target, { ...child.getOwner(), signal: new AbortController().signal })
      const rejected = vi.fn()
      void intent.catch(rejected)
      await Promise.resolve()
      await echo
      expect(rejected).not.toHaveBeenCalled()
      // Runtime/settings echo retains the accepted generation while ACK waits.
      await parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal: new AbortController().signal })
      expect(ports.parent.sent.at(-1)).not.toHaveProperty('selectionRequestId')
      expect(rejected).not.toHaveBeenCalled()
      await parent.request('view.sync', { ...createEmbedSnapshot(), selection: owner.target! }, { ...parent.getOwner(), signal: new AbortController().signal })
      expect(ports.parent.sent.at(-1)).not.toHaveProperty('selectionRequestId')
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'RUNTIME_CHANGED' }))
      release()
      await expect(intent).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    }
    finally {
      release()
      parent.close()
      child.close()
    }
  })

  it('rejects stale child intent even when independent host choice matches requested target', async () => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'view', dispatch })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'view', child: true, dispatch: () => null })
    try {
      const target = { storyId: 'a:b', variantId: 'other' }
      const stale = child.request('selection.select', target, { ...child.getOwner(), signal: new AbortController().signal })
      const rejected = vi.fn()
      void stale.catch(rejected)
      await parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal: new AbortController().signal })
      expect(dispatch).not.toHaveBeenCalled()
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'RUNTIME_CHANGED' }))
      await expect(stale).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    }
    finally {
      parent.close()
      child.close()
    }
  })

  it.each(['primary', 'view'] as const)('rejects queued %s intent across host A-B-A transitions', async (role) => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role, dispatch })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role, child: true, dispatch: () => null })
    try {
      const stale = child.request('selection.select', { storyId: 'a', variantId: 'b:c' }, { ...child.getOwner(), signal: new AbortController().signal })
      const rejected = vi.fn()
      void stale.catch(rejected)
      const first = parent.request('view.sync', { ...createEmbedSnapshot(), selection: { storyId: 'a:b', variantId: 'other' } }, { ...parent.getOwner(), signal: new AbortController().signal })
      const second = parent.request('view.sync', { ...createEmbedSnapshot(), selection: owner.target! }, { ...parent.getOwner(), signal: new AbortController().signal })
      await Promise.all([first, second])
      expect(dispatch).not.toHaveBeenCalled()
      // Accepted host publication settles superseded intent without waiting 15s.
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'RUNTIME_CHANGED' }))
      await expect(stale).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
      // State/settings publications preserving target do not retire fresh intent.
      const fresh = child.request('selection.select', { storyId: 'a', variantId: 'b:c' }, { ...child.getOwner(), signal: new AbortController().signal })
      await parent.request('view.sync', { ...createEmbedSnapshot(), selection: owner.target! }, { ...parent.getOwner(), signal: new AbortController().signal })
      await expect(fresh).resolves.toBeNull()
      expect(dispatch).toHaveBeenCalledOnce()
    }
    finally {
      parent.close()
      child.close()
    }
  })

  it.each(['selection.select', 'view.sync'] as const)('rejects queued child intent after accepted host %s', async (command) => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch })
    ports.child.start()
    const target = { storyId: 'a:b', variantId: 'other' }
    const snapshot = { ...createEmbedSnapshot(), selection: target }
    const operation = parent.request(command, command === 'view.sync' ? snapshot : target, { ...owner, ...(command === 'selection.select' ? { target } : {}), signal: new AbortController().signal })
    // Intent originated in old selected cell and was withheld until host accepted
    // another selection; its desired payload must not grant it fresh authority.
    ports.child.postMessage({ ...owner, kind: 'request', requestId: 'old-intent', command: 'selection.select', payload: { storyId: 'a', variantId: 'b:c' } })
    await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
    expect(parent.getOwner().target).toEqual(target)
    parent.close()
    await expect(operation).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('retains document and previous target on live child intent while parent selection may replace document', async () => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true })
    const target = { storyId: 'a:b', variantId: 'other' }
    await expect(child.request('selection.select', target, { ...owner, signal: new AbortController().signal })).resolves.toBeNull()
    expect((ports.child.sent[0] as HistoireBridgeIdentity).runtimeId).toBe(owner.runtimeId)
    expect((ports.child.sent[0] as HistoireBridgeIdentity).target).toEqual(owner.target)
    expect(dispatch).toHaveBeenCalledOnce()
    parent.close()
    child.close()
  })

  it('cannot revive old intent through late readiness or docs-only runtime teardown', async () => {
    const ports = createEmbedPortPair()
    const dispatch = vi.fn(() => null)
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch })
    ports.child.start()
    const target = { storyId: 'docs', variantId: null }
    const operation = parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...owner, signal: new AbortController().signal })
    ports.child.postMessage({ ...owner, kind: 'event', event: 'readiness.changed', sequence: 1, payload: { runtime: { status: 'ready', mountId: owner.mountId, runtimeId: owner.runtimeId, layout: 'single', viewports: [], viewport: null } } })
    await Promise.resolve()
    expect(parent.getOwner().target).toEqual(target)
    ports.child.postMessage({ ...owner, runtimeId: undefined, target: undefined, kind: 'event', event: 'readiness.changed', sequence: 2, payload: { runtime: { status: 'absent', mountId: owner.mountId, runtimeId: null, layout: null, viewports: [], viewport: null } } })
    await Promise.resolve()
    expect(parent.getOwner().target).toEqual(target)
    ports.child.postMessage({ ...owner, kind: 'request', requestId: 'retired-intent', command: 'selection.select', payload: { storyId: 'a', variantId: 'b:c' } })
    await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
    parent.close()
    await expect(operation).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('drops explicitly stale runtime-less absence while preserving targetless teardown and fresh readiness', async () => {
    const ports = createEmbedPortPair()
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch: () => null })
    try {
      const target = { storyId: 'a:b', variantId: 'other' }
      await parent.request('view.sync', { ...createEmbedSnapshot(), selection: target }, { ...parent.getOwner(), signal: new AbortController().signal })
      const absence = { ...owner, runtimeId: undefined, kind: 'event', event: 'readiness.changed', sequence: 1, payload: { runtime: { status: 'absent', mountId: owner.mountId, runtimeId: null, layout: null, viewports: [], viewport: null } } }
      // Absence attributed to earlier selection cannot undo accepted host target.
      ports.child.postMessage(absence)
      await Promise.resolve()
      expect(parent.getOwner().target).toEqual(target)
      expect(parent.getOwner().runtimeId).toBe(owner.runtimeId)
      ports.child.postMessage({ ...absence, target: undefined, sequence: 2 })
      await Promise.resolve()
      expect(parent.getOwner().target).toEqual(target)
      expect(parent.getOwner().runtimeId).toBeUndefined()
      ports.child.postMessage({ ...owner, runtimeId: 'replacement', target, kind: 'event', event: 'readiness.changed', sequence: 3, payload: { runtime: { status: 'ready', mountId: owner.mountId, runtimeId: 'replacement', layout: 'single', viewports: [], viewport: null } } })
      await Promise.resolve()
      expect(parent.getOwner().target).toEqual(target)
      expect(parent.getOwner().runtimeId).toBe('replacement')
    }
    finally {
      parent.close()
      child.close()
    }
  })
})
