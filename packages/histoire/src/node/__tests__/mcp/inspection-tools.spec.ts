import { describe, expect, it, vi } from 'vitest'
import { mcpToolInputSchemas, mcpToolOutputSchemas } from '../../mcp/protocol/tool-schema.js'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { createOperationServerExtension } from '../../mcp/server/operation-tools.js'
import { dispatchWorkerRequest } from '../../mcp/transport/worker-dispatch.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { deferred } from '../utils/mcp/deferred.js'
import { operationFixture } from '../utils/mcp/operations.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

/** Exact target shared by admission, SDK and worker boundary checks. */
const target = { storyId: 'story', variantId: 'variant', requestKey: 'inspection' }
/** Small real inspection DTO, independent of browser acquisition. */
const result = { storyId: target.storyId, variantId: target.variantId, inspection: 'dom', viewport: { width: 1280, height: 800 }, matched: true, nodes: [], truncated: false }

describe('mCP inspection tools', () => {
  it('publishes strict bounded inputs for all four isolated inspections', () => {
    for (const name of ['histoire_inspect_variant', 'histoire_inspect_dom', 'histoire_inspect_accessibility', 'histoire_get_runtime_diagnostics'] as const) {
      const schema = mcpToolInputSchemas[name]
      expect(schema.parse(target)).toMatchObject({ width: 1280, height: 800, textDirection: 'ltr' })
      for (const extra of [{ script: 'alert(1)' }, { url: 'https://example.com' }, { props: { password: 'x' } }]) {
        expect(schema.safeParse({ ...target, ...extra }).success).toBe(false)
      }
    }
    expect(mcpToolInputSchemas.histoire_inspect_dom.safeParse({ ...target, maxNodes: 501 }).success).toBe(false)
    expect(mcpToolInputSchemas.histoire_get_runtime_diagnostics.safeParse({ ...target, observationMs: 2001 }).success).toBe(false)
  })

  it('discovers implemented inspection, reconciles retries, polls and reads owned results', async () => {
    const project = await createReadProjectFixture()
    const { operations } = operationFixture(project.project.projectId)
    const run = deferred<any>()
    const executor = vi.fn(() => ({ run: () => run.promise }))
    operations.registerExecutor('inspect-dom', executor)
    const connection = await createMcpTestClient(() => createHistoireMcpServer({ project: project.project, principal: 'alice', version: 'test', ...createOperationServerExtension(operations) }))
    try {
      const names = (await connection.client.listTools()).tools.map(tool => tool.name)
      expect(names).toContain('histoire_inspect_dom')
      expect(names).not.toContain('histoire_inspect_variant')
      const first = await connection.client.callTool({ name: 'histoire_inspect_dom', arguments: target })
      const retry = await connection.client.callTool({ name: 'histoire_inspect_dom', arguments: { ...target, width: 1280 } })
      const operationId = (first.structuredContent as any).data.operationId
      expect((retry.structuredContent as any).data.operationId).toBe(operationId)
      expect(executor).toHaveBeenCalledOnce()
      const conflict = await connection.client.callTool({ name: 'histoire_inspect_dom', arguments: { ...target, selector: '#other' } })
      expect(conflict).toMatchObject({ isError: true, structuredContent: { error: { code: 'REQUEST_KEY_CONFLICT' } } })
      const data = result
      run.resolve({ result: data })
      await vi.waitFor(() => expect(operations.get('alice', operationId).state).toBe('completed'))
      const polled = await connection.client.callTool({ name: 'histoire_get_operation', arguments: { operationId } })
      expect(mcpToolOutputSchemas.histoire_inspect_dom.safeParse(polled.structuredContent).success).toBe(true)
      expect((polled.structuredContent as any).data.result).toEqual(data)
      expect(() => operations.get('bob', operationId)).toThrow('Operation is unavailable or expired')
      const resource = await connection.client.readResource({ uri: `histoire://${project.project.projectId}/operations/${operationId}` })
      expect(JSON.parse((resource.contents[0] as any).text).result).toEqual(data)
      expect(operations.snapshot()[0].tool).toBe('histoire_inspect_dom')
    }
    finally {
      await connection.close()
      await operations.close()
      await project.close()
    }
  })

  it('forwards inspection through finite stdio worker methods', async () => {
    const admit = vi.fn(() => ({ operationId: 'operation' }))
    await dispatchWorkerRequest({ project: { projectId: 'project' } as any, operations: { admit } as any, principal: 'owner' }, 'inspectDom', target, new AbortController().signal)
    expect(admit).toHaveBeenCalledWith('owner', 'inspect-dom', expect.objectContaining(target), expect.any(AbortSignal))
  })
})
