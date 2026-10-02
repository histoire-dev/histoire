import { describe, expect, it } from 'vitest'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpHttpFixture, createMcpHttpProbe, requestMcpHttp } from '../utils/mcp/http.js'

describe('real SDK dev MCP HTTP serving', () => {
  it.each(['2026-07-28', '2025-11-25'] as const)('serves native %s client without credential setup', async (revision) => {
    const fixture = await createMcpHttpFixture()
    try {
      expect(fixture.server.address()).toMatchObject({ address: '127.0.0.1' })
      const client = await fixture.client(revision)
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['probe'])
      expect((await client.callTool({ name: 'probe', arguments: { value: revision } })).content).toEqual([{ type: 'text', text: revision }])
      expect((await requestMcpHttp(fixture.url, { method: 'GET' })).status).toBe(405)
    }
    finally { await fixture.close() }
  })

  it('keeps concurrent client outcomes isolated across fresh SDK instances', async () => {
    const fixture = await createMcpHttpFixture({ factory: createMcpHttpProbe(async (value) => {
      if (value === 'failure') throw new Error('expected failure')
      return value
    }) })
    try {
      const [first, second] = await Promise.all([fixture.client(), fixture.client()])
      const [failure, success] = await Promise.all([first.callTool({ name: 'probe', arguments: { value: 'failure' } }), second.callTool({ name: 'probe', arguments: { value: 'success' } })])
      expect(failure.isError).toBe(true)
      expect(success.isError).not.toBe(true)
      expect(success.content).toEqual([{ type: 'text', text: 'success' }])
    }
    finally { await fixture.close() }
  })

  it('limits concurrent calls independently from browser execution quotas', async () => {
    const gate = deferred<string>()
    const entered = deferred()
    let count = 0
    const fixture = await createMcpHttpFixture({ factory: createMcpHttpProbe(async () => {
      if (++count === 16) entered.resolve()
      return gate.promise
    }) })
    try {
      const client = await fixture.client()
      const calls = Array.from({ length: 16 }, () => client.callTool({ name: 'probe', arguments: { value: 'waiting' } }))
      await entered.promise
      const extra = await requestMcpHttp(fixture.url, { chunks: [JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 })] })
      expect(extra.status).toBe(429)
      expect(extra.headers['retry-after']).toBe('1')
      gate.resolve('done')
      expect(await Promise.all(calls)).toHaveLength(16)
    }
    finally {
      gate.resolve('done')
      await fixture.close()
    }
  })

  it('falls back only for implicit ports and reports actual ephemeral URL', async () => {
    const first = await createMcpHttpFixture()
    const port = (first.server.address() as { port: number }).port
    let second: Awaited<ReturnType<typeof createMcpHttpFixture>> | undefined
    try {
      await expect(createMcpHttpFixture({ port })).rejects.toMatchObject({ code: 'EADDRINUSE' })
      second = await createMcpHttpFixture({ port, explicitPort: false })
      expect(second.url).not.toBe(first.url)
      expect(new URL(second.url).port).not.toBe('0')
      const client = await second.client()
      expect((await client.listTools()).tools).toHaveLength(1)
    }
    finally {
      await second?.close()
      await first.close()
    }
  })

  it.each(['2026-07-28', '2025-11-25'] as const)('stops active %s protocol calls and closes owned listener once', async (revision) => {
    const gate = deferred<string>()
    const entered = deferred()
    const fixture = await createMcpHttpFixture({ factory: createMcpHttpProbe(async () => {
      entered.resolve()
      return gate.promise
    }) })
    try {
      const client = await fixture.client(revision)
      const pending = client.callTool({ name: 'probe', arguments: { value: 'waiting' } }).catch(error => error)
      await entered.promise
      const closing = Promise.all([fixture.stop(), fixture.stop()])
      expect(await pending).toBeInstanceOf(Error)
      gate.resolve('done')
      await closing
      await expect(fetch(fixture.url)).rejects.toThrow()
    }
    finally {
      gate.resolve('done')
      await fixture.close()
    }
  })
})
