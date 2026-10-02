import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readPngDimensions } from '../../mcp/browser/screenshot.js'
import { MCP_LIMITS } from '../../mcp/protocol/limits.js'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'
import { decodeMcpResourceUri } from '../../mcp/protocol/uris.js'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { createOperationServerExtension } from '../../mcp/server/operation-tools.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { operationFixture } from '../utils/mcp/operations.js'
import { padPreviewPng, readPreviewPng } from '../utils/mcp/preview-png.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('principal-owned screenshot artifact projection', () => {
  it.each([false, true])('polls existing PNG with large=%s, distinct artifact UUID, resource hash and expiry', async (large) => {
    const project = await createReadProjectFixture()
    const initialTime = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(initialTime)
    const fixture = operationFixture(project.project.projectId)
    const source = await readPreviewPng()
    const png = large ? padPreviewPng(source, MCP_LIMITS.inlineImageBytes) : source
    const dimensions = readPngDimensions(png)
    const sha256 = createHash('sha256').update(png).digest('hex')
    const run = vi.fn(() => ({ artifact: png, result: { storyId: 'story', variantId: 'variant', ...dimensions, bytes: png.length, mimeType: 'image/png' as const, sha256, artifactUri: '' } }))
    fixture.operations.registerExecutor('screenshot', () => ({ run }))
    const extension = createOperationServerExtension(fixture.operations)
    const connection = await createMcpTestClient(() => createHistoireMcpServer({ project: project.project, principal: 'alice', version: '1.0.0', ...extension }))
    try {
      const input = mcpToolInputSchemas.histoire_capture_screenshot.parse({ storyId: 'story', variantId: 'variant', requestKey: 'png-resource', width: 480, height: 320 })
      const admitted = fixture.operations.admit('alice', 'screenshot', input)
      await vi.waitFor(() => expect(fixture.operations.get('alice', admitted.operationId).state).toBe('completed'))
      const polled = await connection.client.callTool({ name: 'histoire_get_operation', arguments: { operationId: admitted.operationId } })
      const metadata = (polled.structuredContent as any).data.result
      const uri = metadata.artifactUri
      expect(uri.split('/').at(-1)).not.toBe(admitted.operationId)
      const resource = await connection.client.readResource({ uri })
      const bytes = Buffer.from((resource.contents[0] as any).blob, 'base64')
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
      expect(polled.content.some(item => item.type === (large ? 'resource_link' : 'image'))).toBe(true)
      const address = decodeMcpResourceUri(uri, project.project.projectId)
      expect(() => fixture.operations.readResource(address, uri, 'bob')).toThrow('Artifact is unavailable or expired')
      await connection.client.callTool({ name: 'histoire_get_operation', arguments: { operationId: admitted.operationId } })
      expect(run).toHaveBeenCalledOnce()
      await connection.close()
      clock.mockReturnValue(initialTime + MCP_LIMITS.retentionMs)
      expect(() => fixture.operations.readResource(address, uri, 'alice')).toThrow('Artifact is unavailable or expired')
    }
    finally {
      await connection.close()
      await fixture.operations.close()
      await project.close()
      clock.mockRestore()
    }
  })
})
