import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createDevMcpActivity } from '../mcp/observer/activity.js'
import { attachMcpObserver } from '../mcp/observer/context.js'
import { mcpToolInputSchemas } from '../mcp/protocol/tool-schema.js'
import { boundMcpSnapshot } from '../server/ui-channel/mcp-snapshot.js'
import { registerMcpChannel } from '../server/ui-channel/mcp.js'
import { assertUiPayload, UI_CHANNEL_BYTES } from '../server/ui-channel/validation.js'
import { deferred } from './utils/mcp/deferred.js'
import { operationFixture } from './utils/mcp/operations.js'
import { uiChannelFixture } from './utils/ui-channel.js'

describe('mCP UI reconnect and cancellation ownership', () => {
  it('delivers bounded reconnect history with exact long multibyte target IDs', async () => {
    const activity = createDevMcpActivity()
    const context = { root: '/tmp/histoire-review' } as any
    const fixture = uiChannelFixture()
    const detach = attachMcpObserver(context, { ...activity, cancelFromUi() {} })
    registerMcpChannel(context, fixture.channel)
    activity.setEnabled(true)
    const input = mcpToolInputSchemas.histoire_get_source.parse({ storyId: '界'.repeat(666) })
    try {
      for (let index = 0; index < 50; index++) {
        await activity.observeExchange(async () => activity.observeReadTool('histoire_get_source', input, () => undefined))
      }
      fixture.client.send.mockClear()
      await fixture.request('histoire:ui:ready', {})
      expect(fixture.client.send).toHaveBeenCalledOnce()
      const snapshot = fixture.client.send.mock.calls[0][1]
      expect(() => assertUiPayload(snapshot)).not.toThrow()
      expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
      expect(Buffer.byteLength(JSON.stringify({ type: 'custom', event: 'histoire:ui:mcp-snapshot', data: snapshot }))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
      expect(snapshot.status).toBe('enabled')
      expect(snapshot.operations.length).toBeGreaterThan(0)
      expect(snapshot.operations.length).toBeLessThan(50)
      expect(snapshot.operations.every(operation => operation.target.storyId === input.storyId)).toBe(true)
      fixture.client.send.mockClear()
      await fixture.request('histoire:ui:ready', {})
      expect(fixture.client.send).toHaveBeenCalledOnce()
    }
    finally {
      detach()
      await fixture.channel.close()
    }
  })

  it('reports exact cancellation rejection privately while async reads remain uncancellable', async () => {
    const activity = createDevMcpActivity()
    const { operations } = operationFixture()
    const gate = deferred<void>()
    const context = { root: '/tmp/histoire-review' } as any
    const fixture = uiChannelFixture()
    const detach = attachMcpObserver(context, { ...activity, cancelFromUi: operations.cancelFromUi })
    registerMcpChannel(context, fixture.channel)
    const reading = activity.observeExchange(async () => {
      await activity.observeReadTool('histoire_get_docs', { storyId: 'story' }, () => gate.promise)
    })
    try {
      const read = activity.snapshot().operations[0]
      expect(read.state).toBe('running')
      expect(read.cancellable).toBe(false)
      await fixture.request('histoire:ui:mcp-cancel', { operationId: read.id })
      expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:mcp-cancel-result', {
        operationId: read.id,
        error: { code: 'unavailable', message: 'Operation is unavailable or expired' },
      })
      expect(activity.snapshot().operations[0].state).toBe('running')
    }
    finally {
      gate.resolve()
      await reading
      detach()
      await fixture.channel.close()
      await operations.close()
    }
  })

  it('admits bounded read telemetry without blocking concurrent reads, then recovers its reserve', async () => {
    const activity = createDevMcpActivity()
    const context = { root: '/tmp/histoire-review' } as any
    const fixture = uiChannelFixture()
    const detach = attachMcpObserver(context, { ...activity, cancelFromUi() {} })
    registerMcpChannel(context, fixture.channel)
    activity.setEnabled(true)
    const input = mcpToolInputSchemas.histoire_get_source.parse({ storyId: '\u0001'.repeat(2_048) })
    const gate = deferred<void>()
    let started = 0
    const reads = Array.from({ length: 20 }, () => activity.observeExchange(async () => {
      await activity.observeReadTool('histoire_get_source', input, () => {
        started++
        return gate.promise
      })
    }))
    try {
      expect(started).toBe(20)
      expect(activity.snapshot().omitted?.reads).toBe(20)
      fixture.client.send.mockClear()
      await fixture.request('histoire:ui:ready', {})
      expect(fixture.client.send).toHaveBeenCalledOnce()
      expect(() => assertUiPayload(fixture.client.send.mock.calls[0][1])).not.toThrow()
      gate.resolve()
      await Promise.all(reads)
      expect(activity.snapshot().omitted?.reads).toBe(0)
      await activity.observeExchange(async () => activity.observeReadTool('histoire_get_source', { storyId: 'recovered' }, () => undefined))
      expect(activity.snapshot().operations[0].target?.storyId).toBe('recovered')
    }
    finally {
      gate.resolve()
      await Promise.all(reads)
      detach()
      await fixture.channel.close()
    }
  })

  it('explicitly rejects cancellation after observer retirement instead of leaving request pending', async () => {
    const fixture = uiChannelFixture()
    registerMcpChannel({ root: '/tmp/histoire-review' } as any, fixture.channel)
    try {
      await fixture.request('histoire:ui:mcp-cancel', { operationId: 'expired' })
      expect(fixture.client.send).toHaveBeenCalledWith('histoire:ui:mcp-cancel-result', {
        operationId: 'expired',
        error: { code: 'unavailable', message: 'MCP status unavailable.' },
      })
    }
    finally { await fixture.channel.close() }
  })

  it('bounds connected clients and config without evicting or shortening active handles', () => {
    const target = { storyId: '\u0001'.repeat(2_048), variantId: '\u0001'.repeat(2_048) }
    const operation = { id: 'active', clientId: 'client', tool: 'histoire_run_tests', target, state: 'running' as const, startedAt: new Date().toISOString(), cancellable: true }
    const snapshot = boundMcpSnapshot({
      status: 'enabled',
      stdio: { command: '/node', args: ['\u0001'.repeat(12_000)] },
      clients: Array.from({ length: 300 }, (_, index) => ({ id: `client-${index}`, name: '界'.repeat(128), transport: 'http' as const, connectedAt: '', lastSeenAt: '' })),
      operations: [operation],
    })
    expect(() => assertUiPayload(snapshot)).not.toThrow()
    expect(snapshot.status).toBe('enabled')
    expect(snapshot.operations).toEqual([operation])
    expect(snapshot.omitted?.clients).toBe(300)
    expect(snapshot.omitted?.configuration).toBe(true)
    expect(snapshot.stdio).toBeUndefined()
  })

  it('accounts for custom-event wrapper when payload alone sits exactly at byte limit', () => {
    const source = { status: 'enabled' as const, stdio: { command: '/node', args: [''] }, clients: [], operations: [], omitted: { clients: 0, history: 0, reads: 0 } }
    source.stdio.args[0] = 'x'.repeat(UI_CHANNEL_BYTES - Buffer.byteLength(JSON.stringify(source)))
    expect(Buffer.byteLength(JSON.stringify(source))).toBe(UI_CHANNEL_BYTES)
    const snapshot = boundMcpSnapshot(source)
    expect(Buffer.byteLength(JSON.stringify({ type: 'custom', event: 'histoire:ui:mcp-snapshot', data: snapshot }))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
    expect(snapshot.status).toBe('enabled')
    expect(snapshot.omitted?.configuration).toBe(true)
  })
})
