import type { UiMcpOperationInfo } from '@histoire/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { followMcpTarget, mcpClientConfig, mcpStdioClientConfig, mergeMcpOperations } from '../../../../histoire-app/src/app/stores/mcp-activity.js'
import { createMcpStore } from '../../../../histoire-app/src/app/stores/mcp.js'

const channel = vi.hoisted(() => ({ listeners: new Map<string, (value?: any) => void>(), send: vi.fn(() => true) }))
vi.mock('../../../../histoire-app/src/app/util/ui-channel.js', () => ({
  onUiEvent: (event: string, listener: (value: any) => void) => {
    channel.listeners.set(event, listener)
    return () => channel.listeners.delete(event)
  },
  onUiDisconnect: (listener: () => void) => {
    channel.listeners.set('disconnect', listener)
    return () => channel.listeners.delete('disconnect')
  },
  sendUiEvent: channel.send,
}))

const stores: ReturnType<typeof createMcpStore>[] = []
afterEach(() => {
  stores.splice(0).forEach(store => store.close())
  channel.listeners.clear()
  channel.send.mockClear()
})

/** Each test has its own mount-owned activity store and channel teardown. */
function store(navigate?: Parameters<typeof createMcpStore>[0]) {
  const result = createMcpStore(navigate)
  stores.push(result)
  result.connect()
  return result
}

/** Minimal public operation DTO; no request bodies or internal runtime state. */
function operation(id: string, state: UiMcpOperationInfo['state'] = 'done'): UiMcpOperationInfo {
  return { id, clientId: 'client', tool: 'histoire_run_tests', target: { storyId: 'button', variantId: 'loading' }, state, cancellable: state === 'queued' || state === 'running', startedAt: new Date(Number(id) * 1000).toISOString() }
}

describe('projects MCP activity', () => {
  it('upserts lifecycle progress without duplicating history, bounds completed history and keeps active operations', () => {
    const history = Array.from({ length: 53 }, (_, index) => operation(String(index)))
    const running = operation('0', 'running')
    const merged = mergeMcpOperations(history, running)
    expect(merged.filter(item => item.state === 'done')).toHaveLength(50)
    expect(merged.find(item => item.id === '0')).toEqual(running)
    const progressed = { ...running, progress: { done: 3, total: 6 } }
    expect(mergeMcpOperations(merged, progressed).filter(item => item.id === '0')).toEqual([progressed])
  })

  it('follows only transitions into running and preserves exact story and variant IDs', () => {
    const running = operation('1', 'running')
    running.target = { storyId: '..', variantId: 'loading / large' }
    expect(followMcpTarget(undefined, running, false)).toBeUndefined()
    expect(followMcpTarget(operation('1', 'queued'), running, true)).toEqual(running.target)
    expect(followMcpTarget(running, { ...running, progress: { done: 1, total: 2 } }, true)).toBeUndefined()
    expect(followMcpTarget(undefined, operation('2', 'done'), true)).toBeUndefined()
    expect(followMcpTarget(undefined, { ...running, target: undefined }, true)).toBeUndefined()
  })

  it('copies HTTP configuration from runtime endpoint without forwarding URL credentials', () => {
    expect(JSON.parse(mcpClientConfig('http://localhost:6010/__histoire/mcp')!)).toEqual({ mcpServers: { histoire: { url: 'http://localhost:6010/__histoire/mcp' } } })
    expect(mcpClientConfig('https://secret:token@example.com/mcp?token=private')).toBeUndefined()
  })

  it('copies exact stdio executable and arguments without inventing project or config paths', () => {
    const stdio = { command: '/opt/node', args: ['/project with spaces/node_modules/histoire/bin.mjs', 'mcp', '--root', '/project with spaces', '--config', 'custom.config.ts'] }
    expect(JSON.parse(mcpStdioClientConfig(stdio))).toEqual({ mcpServers: { histoire: stdio } })
  })
})

describe('owns MCP activity per mount', () => {
  it('exposes stdio config without HTTP endpoint and clears it after disconnect', () => {
    const activity = store()
    const stdio = { command: '/opt/node', args: ['/project/node_modules/histoire/bin.mjs', 'mcp', '--root', '/project'] }
    channel.listeners.get('histoire:ui:mcp-snapshot')!({ status: 'enabled', stdio, clients: [], operations: [] })
    expect(activity.endpoint).toBeUndefined()
    expect(activity.stdio).toEqual(stdio)
    channel.listeners.get('disconnect')!()
    expect(activity.stdio).toBeUndefined()
  })

  it('retains public client names after HTTP disconnects and bounds remembered identities', () => {
    const activity = store()
    const snapshot = channel.listeners.get('histoire:ui:mcp-snapshot')!
    const client = { id: 'client', name: 'SDK client', transport: 'http', connectedAt: '', lastSeenAt: '' }
    snapshot({ status: 'enabled', clients: [client], operations: [operation('1', 'running')] })
    snapshot({ status: 'enabled', clients: [], operations: [operation('1', 'running')] })
    expect(activity.clients).toEqual([])
    expect(activity.clientName(activity.current!.clientId)).toBe('SDK client')
    const clients = Array.from({ length: 101 }, (_, index) => ({ ...client, id: `client-${index}`, name: `SDK client ${index}` }))
    snapshot({ status: 'enabled', clients, operations: [] })
    snapshot({ status: 'enabled', clients: [], operations: [] })
    expect(activity.clientName('client-0')).toBe('MCP client')
    expect(activity.clientName('client-1')).toBe('SDK client 1')
    expect(activity.clientName('client-100')).toBe('SDK client 100')
    activity.close()
    expect(activity.clientName('client-100')).toBe('MCP client')
  })

  it('cancels exactly one active operation and waits for server confirmation', () => {
    const activity = store()
    channel.listeners.get('histoire:ui:mcp-snapshot')!({ status: 'enabled', endpoint: 'http://localhost:6006/mcp', clients: [], operations: [operation('1', 'running')] })
    activity.cancel('missing')
    activity.cancel('1')
    activity.cancel('1')
    expect(channel.send.mock.calls).toEqual([['histoire:ui:ready', {}], ['histoire:ui:mcp-cancel', { operationId: '1' }]])
    expect(activity.current?.state).toBe('running')
    expect(activity.cancelling).toEqual(['1'])
    channel.listeners.get('histoire:ui:mcp-operation')!(operation('1', 'cancelled'))
    expect(activity.cancelling).toEqual([])
    expect(activity.current).toBeUndefined()
    expect(activity.history[0]?.state).toBe('cancelled')
    activity.cancel('1')
    expect(channel.send).toHaveBeenCalledTimes(2)
  })

  it('clears stale activity on runtime replacement and disconnect, then releases subscriptions', () => {
    const activity = store()
    const snapshot = channel.listeners.get('histoire:ui:mcp-snapshot')!
    snapshot({ status: 'enabled', clients: [{ id: 'client', name: 'Client', transport: 'http', connectedAt: '', lastSeenAt: '' }], operations: [operation('1', 'running'), operation('2')] })
    channel.listeners.get('disconnect')!()
    expect(activity.status).toBe('unavailable')
    expect(activity.running).toEqual([])
    expect(activity.clients).toEqual([])
    expect(activity.history.map(item => item.id)).toEqual(['2'])
    snapshot({ status: 'disabled', clients: [], operations: [] })
    expect(activity.operations).toEqual([])
    expect(activity.status).toBe('disabled')
    activity.close()
    expect(channel.listeners.size).toBe(0)
  })

  it('stops navigation with Follow off without dropping events, and never repeats progress navigation', async () => {
    const navigate = vi.fn()
    const activity = store(navigate)
    const receive = channel.listeners.get('histoire:ui:mcp-operation')!
    activity.follow = false
    receive(operation('1', 'running'))
    await Promise.resolve()
    expect(navigate).not.toHaveBeenCalled()
    expect(activity.running).toHaveLength(1)
    activity.follow = true
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ storyId: 'button', variantId: 'loading' })
    receive({ ...operation('1', 'running'), progress: { done: 1, total: 2 } })
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(1)
    receive(operation('2', 'running'))
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(2)
    receive(operation('3', 'running'))
    activity.close()
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('follows a running target from fresh snapshot once and skips snapshots while Follow is off', async () => {
    const navigate = vi.fn()
    const activity = store(navigate)
    const snapshot = channel.listeners.get('histoire:ui:mcp-snapshot')!
    const current = operation('1', 'running')
    snapshot({ status: 'enabled', clients: [], operations: [current] })
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledExactlyOnceWith(current.target)
    snapshot({ status: 'enabled', clients: [], operations: [{ ...current, progress: { done: 1, total: 2 } }] })
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(1)
    activity.follow = false
    snapshot({ status: 'enabled', clients: [], operations: [operation('2', 'running')] })
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(activity.current?.id).toBe('2')
  })

  it('ignores navigation failures belonging to a closed mount', async () => {
    let reject: (reason: Error) => void = () => {}
    const activity = store(() => new Promise<void>((_, rejectPromise) => reject = rejectPromise))
    channel.listeners.get('histoire:ui:mcp-operation')!(operation('1', 'running'))
    await Promise.resolve()
    activity.close()
    reject(new Error('Old navigation failed'))
    await Promise.resolve()
    await Promise.resolve()
    expect(activity.error).toBeUndefined()
  })

  it('does not send cancellation for reads and clears rejected cancellation with recoverable feedback', () => {
    const activity = store()
    const snapshot = channel.listeners.get('histoire:ui:mcp-snapshot')!
    const read = { ...operation('1', 'running'), tool: 'histoire_get_docs', cancellable: false }
    const execution = operation('2', 'running')
    snapshot({ status: 'enabled', clients: [], operations: [read, execution] })
    activity.cancel(read.id)
    expect(channel.send).toHaveBeenCalledTimes(1)
    activity.cancel(execution.id)
    expect(activity.cancelling).toEqual([execution.id])
    channel.listeners.get('histoire:ui:mcp-cancel-result')!({ operationId: execution.id, error: { code: 'unavailable', message: 'Operation is unavailable or expired' } })
    expect(activity.cancelling).toEqual([])
    expect(activity.error).toBe('Operation is unavailable or expired')
    expect(activity.running).toHaveLength(2)
    snapshot({ status: 'enabled', clients: [], operations: [read, execution] })
    expect(activity.error).toBe('Operation is unavailable or expired')
    activity.cancel(execution.id)
    expect(activity.cancelling).toEqual([execution.id])
  })
})
