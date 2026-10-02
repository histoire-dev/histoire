import { createServer } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodeServer } from '../../deploy/server.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('portable Node server', () => {
  let fixture: Awaited<ReturnType<typeof createMcpArtifactFixture>>
  let runtime: Awaited<ReturnType<typeof createNodeServer>> | undefined
  beforeEach(async () => {
    fixture = await createMcpArtifactFixture('/book/')
  })
  afterEach(async () => {
    await runtime?.close()
    await fixture.close()
  })

  it.each(['2026-07-28', '2025-11-25'] as const)('serves official %s SDK reads and raw content with protected MCP', async (protocolVersion) => {
    runtime = await createNodeServer({ artifactDirectory: fixture.root, environment: { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: 'ab'.repeat(32) }, arguments: [] })
    const client = new Client({ name: 'node-server-test', version: '1' }, { supportedProtocolVersions: [protocolVersion], versionNegotiation: { mode: protocolVersion === '2026-07-28' ? { pin: protocolVersion } : 'legacy' } })
    await client.connect(new StreamableHTTPClientTransport(new URL(runtime.mcpUrl!), { requestInit: { headers: { Authorization: `Bearer ${'ab'.repeat(32)}` } } }))
    try {
      const project = await client.callTool({ name: 'histoire_get_project', arguments: {} })
      expect(project.structuredContent).toMatchObject({ ok: true, data: { runtimeMode: 'node', status: 'ready', title: 'Portable book', buildId: fixture.manifest.buildId } })
      const selected = await client.callTool({ name: 'histoire_get_story', arguments: { storyId: 'story-a' } })
      const data = (selected.structuredContent as any).data
      expect(data).not.toHaveProperty('record')
      expect((await client.readResource({ uri: data.resources.docs })).contents).toEqual([expect.objectContaining({ text: '# Documentation\n😀\r\n', mimeType: 'text/plain' })])
      expect((await client.readResource({ uri: data.resources.source })).contents).toEqual([expect.objectContaining({ text: 'export default {}' })])
      expect((await fetch(`${runtime.origin}/book/__histoire/ready`)).status).toBe(200)
    }
    finally { await client.close() }
  })

  it('serves book-only without token and rejects missing credentials before listen', async () => {
    await expect(createNodeServer({ artifactDirectory: fixture.root, environment: { HOST: '127.0.0.1', PORT: '0' }, arguments: [] })).rejects.toThrow('HISTOIRE_MCP_TOKEN')
    runtime = await createNodeServer({ artifactDirectory: fixture.root, environment: { HOST: '127.0.0.1', PORT: '0' }, arguments: ['--no-mcp'] })
    expect((await fetch(`${runtime.origin}/book/`)).status).toBe(200)
    expect((await fetch(`${runtime.origin}/book/__histoire/mcp`)).status).toBe(404)
  })

  it('drains owned work and releases port after close', async () => {
    const running = deferred()
    const cleaned = deferred()
    runtime = await createNodeServer({ artifactDirectory: fixture.root, environment: { HOST: '127.0.0.1', PORT: '0' }, arguments: ['--no-mcp'], registerExecutors(operations) {
      operations.registerExecutor('tests', () => ({
        run(signal) {
          running.resolve()
          return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
        },
        cleanup() { cleaned.resolve() },
      }))
    } })
    runtime.operations.admit('local', 'tests', { storyId: 'story-a', requestKey: 'shutdown' })
    await running.promise
    const port = Number(new URL(runtime.origin).port)
    await Promise.all([runtime.close(), runtime.close(), cleaned.promise])
    expect((await runtime.project.getProject()).status).toBe('closed')
    const replacement = createServer()
    await new Promise<void>((resolve, reject) => {
      replacement.once('error', reject)
      replacement.listen(port, '127.0.0.1', resolve)
    })
    await new Promise<void>((resolve, reject) => replacement.close(error => error ? reject(error) : resolve()))
  })
})
