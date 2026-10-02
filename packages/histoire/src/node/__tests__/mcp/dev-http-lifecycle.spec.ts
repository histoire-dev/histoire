import type { McpRuntimeController } from '../../mcp/project/dev-facade.js'
import type { ProjectRuntimeHandle, ProjectRuntimeStatus } from '../../runtime/types.js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it, vi } from 'vitest'
import { createDevMcpRuntime } from '../../mcp/dev-runtime.js'
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
