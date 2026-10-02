import { describe, expect, it, vi } from 'vitest'
import { createHistoireMcpServer } from '../../mcp/server/factory.js'
import { createOperationServerExtension } from '../../mcp/server/operation-tools.js'
import { createMcpTestClient } from '../utils/mcp/client.js'
import { deferred } from '../utils/mcp/deferred.js'
import { operationFixture, testOperationOutput } from '../utils/mcp/operations.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('sDK operation tools and resources', () => {
  it('advertises implemented starters and polls/cancels exact owned handles', async () => {
    const project = await createReadProjectFixture()
    const { operations } = operationFixture(project.project.projectId)
    const pending = deferred<ReturnType<typeof testOperationOutput>>()
    operations.registerExecutor('tests', () => ({ run: () => pending.promise }))
    const extension = createOperationServerExtension(operations)
    const connection = await createMcpTestClient(() => createHistoireMcpServer({ project: project.project, principal: 'alice', version: '1.0.0', ...extension }))
    try {
      const tools = await connection.client.listTools()
      expect(tools.tools.some(tool => tool.name === 'histoire_run_tests')).toBe(true)
      expect(tools.tools.some(tool => tool.name === 'histoire_capture_screenshot')).toBe(false)
      const started = await connection.client.callTool({ name: 'histoire_run_tests', arguments: { storyId: 'story', variantId: 'variant', requestKey: 'sdk-operation' } })
      const operationId = (started.structuredContent as any).data.operationId
      const cancelling = await connection.client.callTool({ name: 'histoire_cancel_operation', arguments: { operationId } })
      expect((cancelling.structuredContent as any).data.state).toBe('cancelling')
      pending.resolve(testOperationOutput())
      await vi.waitFor(() => expect(operations.get('alice', operationId).state).toBe('cancelled'))
      const polled = await connection.client.callTool({ name: 'histoire_get_operation', arguments: { operationId } })
      expect((polled.structuredContent as any).data.state).toBe('cancelled')
      const resource = await connection.client.readResource({ uri: `histoire://${project.project.projectId}/operations/${operationId}?offset=0&limit=100` })
      expect(JSON.parse((resource.contents[0] as any).text).operationId).toBe(operationId)
    }
    finally {
      await connection.close()
      await operations.close()
      await project.close()
    }
  })

  it('does not advertise unimplemented operation tools or operation resources', async () => {
    const project = await createReadProjectFixture()
    const { operations } = operationFixture(project.project.projectId)
    const connection = await createMcpTestClient(() => createHistoireMcpServer({ project: project.project, principal: 'alice', version: '1.0.0', ...createOperationServerExtension(operations) }))
    try {
      const tools = await connection.client.listTools()
      expect(tools.tools).toHaveLength(6)
      const templates = await connection.client.listResourceTemplates()
      expect(templates.resourceTemplates.some(template => template.uriTemplate.includes('/operations/'))).toBe(false)
    }
    finally {
      await connection.close()
      await operations.close()
      await project.close()
    }
  })
})
