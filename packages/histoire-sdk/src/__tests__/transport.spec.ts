import type { HistoireBridgeIdentity } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmbedDescriptor } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'
import { getBridgeRequestTimeout } from '../transport/validation.js'

const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'bridge', sourceId: 'book', epoch: 'epoch', revision: 'revision' }

/** Shared real-clone port fixture exercises hostile traffic and cleanup. */
function fixture(role: 'data' | 'primary' = 'data') {
  const ports = createEmbedPortPair()
  const bridge = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role })
  ports.child.start()
  const capture = { ...owner, signal: new AbortController().signal }
  return { ...ports, bridge, capture }
}

afterEach(() => vi.useRealTimers())

describe('bound bridge transport', () => {
  it('rejects forged owner without settling request, accepts captured command only once', async () => {
    const test = fixture()
    const promise = test.bridge.request('catalog.search', { query: 'x' }, test.capture)
    const request = test.parent.sent[0] as any
    const response = { ...owner, kind: 'response', requestId: request.requestId, ok: true, result: [] }
    test.child.postMessage({ ...response, connectionId: 'forged' })
    test.child.postMessage(response)
    await expect(promise).resolves.toEqual([])
    test.child.postMessage(response)
    await test.bridge.close()
    expect(test.parent.isClosed()).toBe(true)
  })

  it('promptly rejects correctly correlated oversized result and rejects pending teardown', async () => {
    const test = fixture()
    const promise = test.bridge.request('docs.get', { storyId: 'story' }, test.capture)
    const request = test.parent.sent[0] as any
    test.child.postMessage({ ...owner, kind: 'response', requestId: request.requestId, ok: true, result: { body: 'x'.repeat(1024 * 1024 + 1) } })
    await expect(promise).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' })
    const pending = test.bridge.request('catalog.search', { query: '' }, test.capture)
    await test.bridge.close()
    await expect(pending).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('bounds events per port, rejects old sequence, and marks lost state stale', async () => {
    const test = fixture()
    const notifications: any[] = []
    test.bridge.subscribe(value => notifications.push(value))
    for (let sequence = 1; sequence <= 205; sequence++) test.child.postMessage({ ...owner, kind: 'event', event: 'events.appended', sequence, payload: { items: [{ sequence, timestamp: sequence, target: { storyId: 'story', variantId: 'variant' }, runtimeId: 'runtime', payload: {} }] } })
    await Promise.resolve()
    expect(notifications.filter(value => value.type === 'event')).toHaveLength(200)
    expect(notifications.filter(value => value.type === 'dropped').reduce((sum, value) => sum + value.count, 0)).toBe(5)
    await test.bridge.close()
  })

  it('drops oversized state publication, marks stale, and rejects affected pending work promptly', async () => {
    const test = fixture('primary')
    const notifications: any[] = []
    test.bridge.subscribe(value => notifications.push(value))
    const pending = test.bridge.request('state.get', {}, test.capture)
    test.child.postMessage({ ...owner, kind: 'event', event: 'state.changed', sequence: 1, payload: { runtimeId: 'runtime', target: { storyId: 'story', variantId: 'variant' }, value: { body: 'x'.repeat(1024 * 1024 + 1) } } })
    await expect(pending).rejects.toMatchObject({ code: 'STALE_REVISION' })
    expect(notifications).toMatchObject([{ type: 'dropped', count: 1, stale: true }])
    await test.bridge.close()
  })

  it('times out controls, observes cancellation, and never retries', async () => {
    vi.useFakeTimers()
    const test = fixture()
    const promise = test.bridge.request('catalog.search', { query: '' }, test.capture)
    const rejection = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(test.parent.sent).toHaveLength(1)
    const controller = new AbortController()
    const cancelled = test.bridge.request('catalog.search', { query: '' }, { ...test.capture, signal: controller.signal })
    controller.abort(new HistoireSdkError('DISPOSED', 'disposed'))
    await expect(cancelled).rejects.toMatchObject({ code: 'DISPOSED' })
    await test.bridge.close()
  })

  it('accepts catalog above generic 1 MiB limit and preserves cyclic state aliases', async () => {
    const test = fixture('primary')
    const descriptor = createEmbedDescriptor()
    const stories = [{ ...descriptor.catalog.stories[0], title: 'x'.repeat(1200 * 1024) }]
    const catalog = test.bridge.request('catalog.list', {}, test.capture)
    const catalogRequest = test.parent.sent[0] as any
    test.child.postMessage({ ...owner, kind: 'response', requestId: catalogRequest.requestId, ok: true, result: stories })
    await expect(catalog).resolves.toEqual(stories)
    const value: any = { shared: { count: 1 } }
    value.self = value
    value.alias = value.shared
    const state = test.bridge.request<any>('state.get', {}, test.capture)
    const stateRequest = test.parent.sent[1] as any
    test.child.postMessage({ ...owner, kind: 'response', requestId: stateRequest.requestId, ok: true, result: { target: { storyId: 'story', variantId: 'variant' }, runtimeId: 'runtime', value } })
    const result = await state
    expect(result.value.self).toBe(result.value)
    expect(result.value.alias).toBe(result.value.shared)
    await test.bridge.close()
  })

  it('permits new runtime readiness and never revives retired document IDs', async () => {
    const test = fixture('primary')
    const notifications: any[] = []
    test.bridge.subscribe(value => notifications.push(value))
    const ready = (runtimeId: string, sequence: number) => test.child.postMessage({ ...owner, runtimeId, kind: 'event', event: 'readiness.changed', sequence, payload: { runtime: { status: 'ready', mountId: owner.mountId, runtimeId, layout: 'single', viewports: [], viewport: null } } })
    ready('document-1', 1)
    ready('document-2', 2)
    ready('document-1', 3)
    await Promise.resolve()
    expect(notifications.filter(value => value.type === 'runtime').map(value => value.runtime.runtimeId)).toEqual(['document-1', 'document-2'])
    expect(test.bridge.getOwner().runtimeId).toBe('document-2')
    await test.bridge.close()
  })

  it('keeps initiating selection pending across runtime replacement while rejecting old state work', async () => {
    const test = fixture('primary')
    const ready = (runtimeId: string, sequence: number) => test.child.postMessage({ ...owner, target: test.bridge.getOwner().target, runtimeId, kind: 'event', event: 'readiness.changed', sequence, payload: { runtime: { status: 'ready', mountId: owner.mountId, runtimeId, layout: 'single', viewports: [], viewport: null } } })
    ready('document-1', 1)
    await Promise.resolve()
    const selection = test.bridge.request('selection.select', { storyId: 'next', variantId: 'variant' }, { ...test.capture, target: { storyId: 'next', variantId: 'variant' } })
    const selected = test.parent.sent[0] as any
    expect(selected.runtimeId).toBeUndefined()
    const state = test.bridge.request('state.get', {}, { ...test.capture, runtimeId: 'document-1' })
    ready('document-2', 2)
    await expect(state).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    const { command: _command, payload: _payload, ...captured } = selected
    test.child.postMessage({ ...captured, kind: 'response', ok: true, result: null })
    await expect(selection).resolves.toBeNull()
    ready('document-3', 3)
    await Promise.resolve()
    const afterRotation = test.bridge.request('selection.select', { storyId: 'third', variantId: 'variant' }, { ...test.capture, target: { storyId: 'third', variantId: 'variant' } })
    const { command: _nextCommand, payload: _nextPayload, ...nextCapture } = test.parent.sent[2] as any
    expect(nextCapture.runtimeId).toBeUndefined()
    test.child.postMessage({ ...nextCapture, kind: 'response', ok: true, result: null })
    await expect(afterRotation).resolves.toBeNull()
    await test.bridge.close()
  })
  it('keeps runtime synchronization alive beyond control timeout and retains execution budgets', async () => {
    vi.useFakeTimers()
    const ports = createEmbedPortPair()
    const descriptor = createEmbedDescriptor()
    descriptor.config = { storyCollectTimeout: 40_000, runTimeout: 500_000 } as any
    const bridge = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', descriptor })
    ports.child.start()
    expect(getBridgeRequestTimeout('view.sync', {}, descriptor)).toBe(55_000)
    expect(getBridgeRequestTimeout('tests.run', { mode: 'preview' }, descriptor)).toBe(515_000)
    expect(getBridgeRequestTimeout('tests.run', { mode: 'server' }, createEmbedDescriptor())).toBe(375_000)
    const selection = bridge.request('selection.select', { storyId: 'story', variantId: 'variant' }, { ...owner, signal: new AbortController().signal })
    await vi.advanceTimersByTimeAsync(16_000)
    const { command: _command, payload: _payload, ...capture } = ports.parent.sent[0] as any
    ports.child.postMessage({ ...capture, kind: 'response', ok: true, result: null })
    await vi.advanceTimersByTimeAsync(0)
    await expect(selection).resolves.toBeNull()
    bridge.close()
  })
})
