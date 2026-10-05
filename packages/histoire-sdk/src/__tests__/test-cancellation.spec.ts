import type { HistoireBridgeIdentity } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'
import { deferred } from './fixtures/session.js'

const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'bridge', sourceId: 'book', epoch: 'epoch', revision: 'revision', target: { storyId: 'story', variantId: 'variant' } }

describe('remote test cancellation', () => {
  it('preserves actual engine identity through parent intent port without another progress run', async () => {
    const ports = createEmbedPortPair()
    const primaryOwner = { ...owner, runtimeId: 'document' }
    const execution = { runId: 'engine:request:1', mode: 'preview', sourceId: 'book', epoch: 'epoch', revision: 'revision', target: owner.target, runtimeId: 'document' }
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner: primaryOwner, role: 'primary', dispatch: () => ({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, tests: [], errors: [], execution }) })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner: primaryOwner, role: 'primary', child: true })
    const result = await child.request<any>('tests.run', { mode: 'preview' }, { ...primaryOwner, signal: new AbortController().signal })
    expect(result.execution).toEqual(execution)
    expect(ports.parent.sent.filter((value: any) => value.event === 'tests.progress')).toEqual([])
    parent.close()
    child.close()
  })

  it('resolves failed assertions with initiating request/source/target attribution and progress', async () => {
    const ports = createEmbedPortPair()
    const summary = { ok: false, total: 1, passed: 0, failed: 1, skipped: 0, tests: [{ id: 'test', name: 'assertion', fullName: 'assertion', state: 'failed', errors: ['failed'], storyId: 'story', variantId: 'variant' }], errors: ['failed'.repeat(16_000)] }
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'data', child: true, dispatch: () => summary })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'data' })
    const result = await parent.request<any>('tests.run', { mode: 'server' }, { ...owner, signal: new AbortController().signal })
    const request = ports.parent.sent.find((value: any) => value.command === 'tests.run') as any
    expect(result).toMatchObject({ ok: false, execution: { runId: request.requestId, mode: 'server', sourceId: 'book', epoch: 'epoch', revision: 'revision', target: owner.target } })
    const completed = ports.child.sent.find((value: any) => value.event === 'tests.progress' && value.payload.status === 'completed') as any
    expect(completed.payload).toMatchObject({ completed: 1, total: 1 })
    expect(completed.payload.runId).toBe(result.execution.runId)
    parent.close()
    child.close()
  })

  it('forwards abort to exact remote run and keeps dispatch cleanup observed', async () => {
    const ports = createEmbedPortPair()
    let remote: AbortSignal | undefined
    let finish: () => void
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'data', child: true, dispatch: async (_request, signal) => {
      remote = signal
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      signal.throwIfAborted()
    } })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'data' })
    const controller = new AbortController()
    const pending = parent.request('tests.run', { mode: 'server' }, { ...owner, signal: controller.signal })
    await Promise.resolve()
    controller.abort(new HistoireSdkError('CANCELLED', 'cancelled'))
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    await Promise.resolve()
    expect(remote?.aborted).toBe(true)
    expect(ports.parent.sent.filter((value: any) => value.command === 'tests.run')).toHaveLength(1)
    expect(ports.parent.sent.filter((value: any) => value.command === 'tests.cancel')).toHaveLength(1)
    finish!()
    await Promise.resolve()
    parent.close()
    child.close()
  })

  it('rejects cancellation naming another port request and closes only owned dispatches', async () => {
    const ports = createEmbedPortPair()
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'data', child: true, dispatch: () => new Promise(() => {}) })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'data' })
    await expect(parent.request('tests.cancel', { requestId: 'another:request:1' }, { ...owner, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    parent.close()
    child.close()
  })

  it('cancels captured server execution after runtime retirement without admitting forged owners', async () => {
    const ports = createEmbedPortPair()
    const primaryOwner = { ...owner, runtimeId: 'document' }
    const held = deferred<void>()
    let remote: AbortSignal | undefined
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner: primaryOwner, role: 'primary', child: true, dispatch: async (_request, signal) => {
      remote = signal
      await held.promise
      signal.throwIfAborted()
    } })
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner: primaryOwner, role: 'primary' })
    const controller = new AbortController()
    try {
      const pending = parent.request('tests.run', { mode: 'server' }, { ...primaryOwner, signal: controller.signal })
      await Promise.resolve()
      child.post('readiness.changed', { runtime: { status: 'failed', mountId: owner.mountId, runtimeId: primaryOwner.runtimeId, layout: null, viewports: [], viewport: null } })
      await Promise.resolve()
      const request = ports.parent.sent.find((value: any) => value.command === 'tests.run') as any
      // Cancellation cannot borrow an active request ID across captured owners.
      for (const forged of [{ connectionId: 'other' }, { runtimeId: 'other' }, { target: { storyId: 'other', variantId: 'variant' } }, { selectionVersion: 1 }]) {
        ports.parent.postMessage({ ...request, ...forged, command: 'tests.cancel', requestId: 'forged:cancel', payload: { requestId: request.requestId } })
      }
      await Promise.resolve()
      expect(remote?.aborted).toBe(false)
      controller.abort(new HistoireSdkError('CANCELLED', 'cancelled'))
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
      await Promise.resolve()
      expect(remote?.aborted).toBe(true)
      expect(ports.parent.sent.filter((value: any) => value.command === 'tests.cancel' && value.requestId !== 'forged:cancel')).toHaveLength(1)
    }
    finally {
      held.resolve()
      parent.close()
      child.close()
    }
  })
})
