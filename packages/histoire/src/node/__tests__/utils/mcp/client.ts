import type { McpServerFactory } from '@modelcontextprotocol/server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'

/** Connect real SDK client to real serving factory without fake protocol handlers. */
export async function createMcpTestClient(factory: McpServerFactory) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const handle = serveStdio(factory, { transport: serverTransport })
  const client = new Client({ name: 'histoire-tests', version: '1.0.0' })
  try {
    await client.connect(clientTransport)
  }
  catch (error) {
    await handle.close()
    throw error
  }
  return {
    /** Connected official SDK client. */
    client,
    /** Close both owned sides, including partial failures. */
    async close() {
      await Promise.allSettled([client.close(), handle.close()])
    },
  }
}
