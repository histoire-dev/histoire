import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { mcpOutputSchema, successResult } from '../../mcp/protocol/results.js'
import { createMcpTestClient } from '../utils/mcp/client.js'

/** Minimal factory exercises actual published tool schema and result API. */
function createProbeServer() {
  const server = new McpServer({ name: 'histoire-import-proof', version: '1.0.0' })
  server.registerTool('probe', {
    inputSchema: z.strictObject({}),
    outputSchema: mcpOutputSchema(z.strictObject({ ready: z.boolean() })),
  }, async () => successResult({ ready: true }))
  return server
}

describe('published MCP SDK compatibility', () => {
  it('imports real Node HTTP adapter and closes handler without listening', async () => {
    const handler = createMcpHandler(createProbeServer)
    expect(toNodeHandler(handler)).toBeTypeOf('function')
    await handler.close()
  })

  it('serves a strict output envelope to official client through serving factory', async () => {
    const harness = await createMcpTestClient(createProbeServer)
    try {
      const tools = await harness.client.listTools()
      expect(tools.tools.map(tool => tool.name)).toContain('probe')
      const result = await harness.client.callTool({ name: 'probe', arguments: {} })
      expect(result.structuredContent).toEqual({ ok: true, data: { ready: true } })
    }
    finally {
      await harness.close()
    }
  })
})
