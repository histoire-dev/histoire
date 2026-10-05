import { describe, expect, it } from 'vitest'
import { createNodeServer } from '../../deploy/server.js'
import { createEmbedDescriptor } from '../utils/embed/catalog.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'

describe('node effective embed policy hosting', () => {
  it('serves effective environment policy to data child and frames every owned response', async () => {
    const descriptor = createEmbedDescriptor()
    descriptor.embed = { allowedOrigins: ['https://baked.example'], allowOpenInEditor: false, allowServerTests: false }
    const artifact = await createMcpArtifactFixture('/book/', descriptor)
    let server: Awaited<ReturnType<typeof createNodeServer>> | undefined
    try {
      server = await createNodeServer({ artifactDirectory: artifact.root, environment: { HOST: '127.0.0.1', PORT: '0', HISTOIRE_EMBED_ORIGINS: 'https://runtime.example' }, arguments: ['--no-mcp'] })
      const effective = await fetch(`${server.origin}/book/histoire-embed-origins.json`)
      expect(await effective.json()).toEqual({ version: 1, allowedOrigins: ['https://runtime.example'] })
      for (const response of [effective, await fetch(`${server.origin}/book/missing.js`)]) {
        expect(response.headers.get('content-security-policy')).toContain('https://runtime.example')
        expect(response.headers.get('content-security-policy')).not.toContain('https://baked.example')
      }
      expect((await fetch(`${server.origin}/outside`)).headers.get('content-security-policy')).toBeNull()
    }
    finally {
      await server?.close()
      await artifact.close()
    }
  })
})
