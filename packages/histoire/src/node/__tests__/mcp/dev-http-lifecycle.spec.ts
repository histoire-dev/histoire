import type { McpRuntimeController } from '../../mcp/project/dev-facade.js'
import type { ProjectRuntimeHandle, ProjectRuntimeStatus } from '../../runtime/types.js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it, vi } from 'vitest'
import { createDevMcpRuntime } from '../../mcp/dev-runtime.js'
import { getMcpObserver, onMcpObserverChange } from '../../mcp/observer/context.js'
import { createMcpEpoch } from '../../mcp/protocol/ids.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../utils/mcp/project.js'

/** Creates mutable lifecycle observation without acquiring another global dev runtime. */
function createControllerFixture(root: string) {
  const listeners = new Set<() => void>()
  let current: ProjectRuntimeHandle | undefined
  let status: ProjectRuntimeStatus = 'starting'
  const controller: McpRuntimeController = {
    get current() { return current },
    get status() { return status },
    subscribe(listener) {
      const announce = () => listener(status, current)
      listeners.add(announce)
      return () => {
        listeners.delete(announce)
      }
    },
  }
  return {
    controller,
    /** Invalidates preceding handle before observers see a new lifecycle. */
    publish(next: ProjectRuntimeStatus) {
      status = next
      current = undefined
      if (next === 'ready') {
        const context = createMcpContext(root, [createMcpStory(root)])
        context.config.theme = { title: 'HTTP lifecycle book' }
        const epoch = createMcpEpoch()
        current = {
          context,
          epoch,
          server: { config: { base: '/' }, resolvedUrls: { local: ['http://localhost:6006/'] } } as any,
          ready: Promise.resolve(),
          close: async () => {},
          collect: async () => {},
          onCollection: () => () => {},
          isActive: () => current?.epoch === epoch,
        }
      }
      for (const listener of listeners) listener()
    },
  }
}

describe('dev HTTP controller lifetime', () => {
  it('reports guarded HTTP exchanges, safe reads, and current runtime attachment', async () => {
    const fixture = await createMcpProjectFixture()
    const lifecycle = createControllerFixture(fixture.root)
    lifecycle.publish('ready')
    const originalContext = lifecycle.controller.current!.context
    const attachments: any[] = []
    const offAttachment = onMcpObserverChange(originalContext, observer => attachments.push(observer))
    const token = 'b2'.repeat(32)
    const runtime = await createDevMcpRuntime({ controller: lifecycle.controller, root: fixture.root, token })
    const client = new Client({ name: 'ui-observer-client', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    const snapshots: any[] = []
    const operations: any[] = []
    const offClients = runtime.onClientChange(snapshot => snapshots.push(snapshot))
    const offOperations = runtime.onOperationChange(operation => operations.push(operation))
    try {
      expect(runtime.snapshot()).toMatchObject({ status: 'disabled', clients: [], operations: [] })
      expect(getMcpObserver(originalContext)).toBe(runtime)
      expect(attachments).toEqual([runtime])
      await runtime.reconcile({ enabled: true, port: 0, explicitPort: true })
      expect(runtime.snapshot()).toMatchObject({ status: 'enabled', endpoint: runtime.url })
      await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url!), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
      await client.callTool({ name: 'histoire_get_project', arguments: {} })
      await vi.waitFor(() => expect(runtime.snapshot().clients).toEqual([]))
      expect(snapshots.some(snapshot => snapshot.clients.some((connected: any) => connected.transport === 'http'))).toBe(true)
      expect(snapshots.flatMap(snapshot => snapshot.clients.map((connected: any) => connected.name))).toContain('ui-observer-client')
      expect(operations.filter(operation => operation.tool === 'histoire_get_project').map(operation => operation.state)).toEqual(['queued', 'running', 'done'])
      const publicToolEvents = operations.length
      await client.readResource({ uri: `histoire://${runtime.project.projectId}/project` })
      expect(operations).toHaveLength(publicToolEvents)
      const serialized = JSON.stringify({ snapshots, operations })
      expect(serialized).not.toContain(token)
      expect(serialized).not.toContain('local:')
      expect(serialized).not.toContain('Bearer')
      lifecycle.publish('restarting')
      expect(getMcpObserver(originalContext)).toBeUndefined()
      expect(attachments).toEqual([runtime, undefined])
      lifecycle.publish('ready')
      expect(getMcpObserver(lifecycle.controller.current!.context)).toBe(runtime)
      expect(runtime.snapshot().operations).toEqual([])
      await runtime.reconcile({ enabled: false, port: 0, explicitPort: true })
      expect(runtime.snapshot()).toMatchObject({ status: 'disabled', clients: [] })
    }
    finally {
      offClients()
      offOperations()
      offAttachment()
      await client.close()
      await runtime.close()
      await fixture.close()
      expect(getMcpObserver(originalContext)).toBeUndefined()
    }
  })

  it('preserves listener across epochs and closes old socket when config disables MCP', async () => {
    const fixture = await createMcpProjectFixture()
    const lifecycle = createControllerFixture(fixture.root)
    lifecycle.publish('ready')
    const runtime = await createDevMcpRuntime({ controller: lifecycle.controller, root: fixture.root })
    const client = new Client({ name: 'dev-lifecycle', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    try {
      await runtime.reconcile({ enabled: true, port: 0, explicitPort: true })
      const originalUrl = runtime.url!
      await client.connect(new StreamableHTTPClientTransport(new URL(originalUrl)))
      await vi.waitFor(() => expect(runtime.project.capture().catalog.current?.stories).toHaveLength(1))
      const originalEpoch = runtime.project.getProject().epoch
      lifecycle.publish('restarting')
      const restarting = await client.callTool({ name: 'histoire_get_project', arguments: {} })
      expect(restarting.structuredContent).toMatchObject({ ok: true, data: { status: 'restarting' } })
      expect(runtime.url).toBe(originalUrl)
      lifecycle.publish('ready')
      await runtime.reconcile({ enabled: true, port: 0, explicitPort: true })
      await vi.waitFor(() => expect(runtime.project.capture().catalog.current?.stories).toHaveLength(1))
      expect(runtime.project.getProject().epoch).not.toBe(originalEpoch)
      expect(runtime.url).toBe(originalUrl)
      await runtime.reconcile({ enabled: false, port: 0, explicitPort: true })
      expect(runtime.url).toBeUndefined()
      await expect(fetch(originalUrl)).rejects.toThrow()
      await runtime.reconcile({ enabled: true, port: 0, explicitPort: true })
      expect(runtime.url).not.toBe(originalUrl)
      await Promise.all([runtime.close(), runtime.close()])
      await expect(fetch(runtime.url ?? originalUrl)).rejects.toThrow()
      expect(runtime.project.getProject().status).toBe('closed')
    }
    finally {
      await client.close()
      await runtime.close()
      await fixture.close()
    }
  })
})
