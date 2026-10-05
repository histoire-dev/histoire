import type { UiMcpClientInfo, UiMcpOperationInfo, UiMcpSnapshot } from '@histoire/shared'
import type { McpOperationToolService } from '../server/operation-tools.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { mcpByteLength } from '../protocol/limits.js'
import { MCP_UI_READ_BYTES, trimMcpHistory } from './history.js'
import { projectMcpUiTarget } from './target.js'

/** Dev HTTP activity follows stateless exchanges rather than inventing sessions. */
export function createDevMcpActivity() {
  const exchange = new AsyncLocalStorage<string>()
  const clients = new Map<string, UiMcpClientInfo>()
  const operations = new Map<string, UiMcpOperationInfo>()
  const clientListeners = new Set<(snapshot: UiMcpSnapshot) => void>()
  const operationListeners = new Set<(operation: UiMcpOperationInfo) => void>()
  let endpoint: string | undefined
  let enabled = false
  let generation = 0
  let stdioClientId: string | undefined
  let stdioClientName = 'MCP stdio client'
  let activeReadBytes = 0
  let unobservedReads = 0
  let omittedHistory = 0

  /** Create independent snapshots that contain only UI DTOs. */
  function snapshot(): UiMcpSnapshot {
    return { status: enabled ? 'enabled' : 'disabled', endpoint, clients: structuredClone([...clients.values()]), operations: structuredClone([...operations.values()]), omitted: { clients: 0, history: omittedHistory, reads: unobservedReads } }
  }

  /** Isolate UI listeners from HTTP dispatch and runtime cleanup ownership. */
  function announce() {
    for (const listener of clientListeners) {
      try {
        listener(snapshot())
      }
      catch { /* UI observation cannot alter transport behavior. */ }
    }
  }

  /** Upsert one sanitized operation while preserving admission order. */
  function publish(operation: UiMcpOperationInfo) {
    operations.set(operation.id, structuredClone(operation))
    omittedHistory += trimMcpHistory(operations, entry => entry)
    for (const listener of operationListeners) {
      try {
        listener(structuredClone(operation))
      }
      catch { /* UI observation cannot alter execution behavior. */ }
    }
  }

  /** Explicit observation admission preserves read execution when telemetry reserve is full. */
  function unobserved<T>(work: () => T): T {
    const capturedGeneration = generation
    unobservedReads++
    announce()
    /** Retired runtime completions cannot change the successor's omission count. */
    function finish() {
      if (capturedGeneration !== generation) return
      unobservedReads--
      announce()
    }
    try {
      const value = work()
      if (value instanceof Promise) return value.finally(finish) as T
      finish()
      return value
    }
    catch (error) {
      finish()
      throw error
    }
  }

  /** Observe one read without retaining request arguments or returned content. */
  function read<T>(tool: string, input: unknown, work: () => T): T {
    const clientId = exchange.getStore()
    if (!clientId) return work()
    const capturedGeneration = generation
    const target = projectMcpUiTarget(input)
    const operation: UiMcpOperationInfo = { id: randomUUID(), clientId, tool, target, state: 'queued', cancellable: false, startedAt: new Date().toISOString() }
    const bytes = mcpByteLength(JSON.stringify(operation)) + 64
    if (activeReadBytes + bytes > MCP_UI_READ_BYTES) return unobserved(work)
    activeReadBytes += bytes
    publish(operation)
    operation.state = 'running'
    publish(operation)
    /** Suppress read completion after its runtime generation was retired. */
    function finish(state: 'done' | 'failed') {
      if (capturedGeneration !== generation) return
      activeReadBytes -= bytes
      publish({ ...operation, state, endedAt: new Date().toISOString() })
    }
    try {
      const value = work()
      if (value instanceof Promise) {
        return value.then((result) => {
          finish('done')
          return result
        }, (error) => {
          finish('failed')
          throw error
        }) as T
      }
      finish('done')
      return value
    }
    catch (error) {
      finish('failed')
      throw error
    }
  }

  return {
    snapshot,
    publish,
    /** Resolve current transport identity during synchronous operation admission. */
    currentClientId: () => exchange.getStore(),
    /** Only SDK public read-tool callbacks invoke this hook. */
    observeReadTool: read,
    /** Observe each accepted HTTP exchange without parsing request bodies. */
    async observeExchange(work: () => Promise<void>) {
      const id = randomUUID()
      const connectedAt = new Date().toISOString()
      clients.set(id, { id, name: 'MCP HTTP client', transport: 'http', connectedAt, lastSeenAt: connectedAt })
      announce()
      try {
        await exchange.run(id, work)
      }
      finally {
        clients.delete(id)
        announce()
      }
    },
    /** One owned parent pipe is one persistent stdio client, not one per tool. */
    async observeStdio<T>(work: () => Promise<T>): Promise<T> {
      const now = new Date().toISOString()
      if (!stdioClientId) {
        stdioClientId = randomUUID()
        clients.set(stdioClientId, { id: stdioClientId, name: stdioClientName, transport: 'stdio', connectedAt: now, lastSeenAt: now })
      }
      else {
        clients.get(stdioClientId)!.lastSeenAt = now
      }
      announce()
      return exchange.run(stdioClientId, work)
    },
    /** Polls and cancellation are reads of exact handles; failed admission also appears. */
    observeOperations<T extends McpOperationToolService>(service: T): T {
      return new Proxy(service, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver)
          if (typeof value !== 'function') return value
          if (property === 'get' || property === 'cancel') {
            const tool = property === 'get' ? 'histoire_get_operation' : 'histoire_cancel_operation'
            return (...args: unknown[]) => read(tool, undefined, () => Reflect.apply(value, target, args))
          }
          if (property === 'admit') {
            return (...args: unknown[]) => {
              try {
                return Reflect.apply(value, target, args)
              }
              catch (error) {
                const tool = args[1] === 'tests' ? 'histoire_run_tests' : 'histoire_capture_screenshot'
                return read(tool, args[2], () => {
                  throw error
                })
              }
            }
          }
          return value
        },
      })
    },
    /** Display only name selected from SDK metadata, never the metadata envelope. */
    setClientName(name: string) {
      const clientId = exchange.getStore() ?? stdioClientId
      const client = clientId ? clients.get(clientId) : undefined
      if (client) client.name = name
      else stdioClientName = name
      announce()
    },
    /** Publish actual endpoint after binding or disabling policy. */
    setEndpoint(value?: string) {
      endpoint = value
      enabled = value !== undefined
      announce()
    },
    /** Stdio runs without an HTTP endpoint but still exposes an enabled MCP server. */
    setEnabled(value: boolean) {
      enabled = value
      announce()
    },
    /** Worker pipe shutdown retires its one client and server availability. */
    disconnect() {
      clients.clear()
      stdioClientId = undefined
      enabled = false
      announce()
    },
    /** A runtime restart invalidates prior activity and late read completions. */
    reset() {
      generation++
      operations.clear()
      activeReadBytes = unobservedReads = omittedHistory = 0
      announce()
    },
    /** Observe server policy and exchange connection changes. */
    onClientChange(listener: (value: UiMcpSnapshot) => void) {
      clientListeners.add(listener)
      return () => {
        clientListeners.delete(listener)
      }
    },
    /** Observe only sanitized read and execution lifecycle DTOs. */
    onOperationChange(listener: (operation: UiMcpOperationInfo) => void) {
      operationListeners.add(listener)
      return () => {
        operationListeners.delete(listener)
      }
    },
  }
}
