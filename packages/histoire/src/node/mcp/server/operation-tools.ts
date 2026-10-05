import type { CallToolResult, McpServer, ReadResourceResult, ServerContext } from '@modelcontextprotocol/server'
import type { McpOperationInput, McpOperationKind } from '../operations/types.js'
import type { McpOperation } from '../protocol/operation-schema.js'
import type { McpResourceAddress } from '../protocol/uris.js'
import { ResourceTemplate } from '@modelcontextprotocol/server'
import { observeMcpClientName } from '../observer/client-metadata.js'
import { MCP_EXECUTION_TOOLS } from '../protocol/execution-tools.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { errorResult, successResult } from '../protocol/results.js'
import { mcpToolInputSchemas, mcpToolOutputSchemas } from '../protocol/tool-schema.js'
import { decodeMcpResourceUri, encodeMcpResourceUri } from '../protocol/uris.js'
import { registerInspectionTools } from './inspection-tools.js'

/** Local controller store or finite remote worker proxy, without runtime data. */
export interface McpOperationToolService {
  /** Stable implemented executor discovery for this serving factory. */
  hasExecutor: (kind: McpOperationKind) => boolean
  /** Reconcile or admit exact principal-owned starter. */
  admit: (principal: string, kind: McpOperationKind, input: McpOperationInput, signal?: AbortSignal) => McpOperation | Promise<McpOperation>
  /** Read exact random owned handle. */
  get: (principal: string, operationId: string, signal?: AbortSignal) => McpOperation | Promise<McpOperation>
  /** Abort exact random owned handle without optimistic terminal completion. */
  cancel: (principal: string, operationId: string, signal?: AbortSignal) => McpOperation | Promise<McpOperation>
  /** Resolve canonical owned result/artifact address. */
  readResource: (address: McpResourceAddress, uri: string, principal: string, signal?: AbortSignal) => ReadResourceResult | Promise<ReadResourceResult>
}

/** Convert synchronous admission/domain errors into the common tool envelope. */
async function operationResult(work: () => unknown | Promise<unknown>) {
  try {
    return successResult(await work())
  }
  catch (error) { return errorResult(error) }
}

/** Polling and operation resources exist whenever any concrete executor exists. */
function hasExecutionTools(operations: McpOperationToolService): boolean {
  return (Object.keys(MCP_EXECUTION_TOOLS) as McpOperationKind[]).some(kind => operations.hasExecutor(kind))
}

/** Register implemented execution starters and exact operation polling/cancellation. */
export function registerOperationTools(server: McpServer, operations: McpOperationToolService, principal: string, projectId: string, observeClientName?: (name: string) => void) {
  registerInspectionTools(server, operations, principal, observeClientName)
  /** Capture safe client display metadata before admitting private execution. */
  function result(context: ServerContext, work: () => unknown | Promise<unknown>) {
    observeMcpClientName(server, context, observeClientName)
    return operationResult(work)
  }
  const starters = { readOnlyHint: false, idempotentHint: false, openWorldHint: true }
  if (operations.hasExecutor('screenshot')) {
    server.registerTool('histoire_capture_screenshot', { description: 'Start exact variant screenshot. Reuse requestKey to reconcile retries for ten minutes after completion.', inputSchema: mcpToolInputSchemas.histoire_capture_screenshot, outputSchema: mcpToolOutputSchemas.histoire_capture_screenshot, annotations: { ...starters, destructiveHint: false } }, (input, context) => result(context, () => operations.admit(principal, 'screenshot', input, context.mcpReq.signal)))
  }
  if (operations.hasExecutor('tests')) {
    server.registerTool('histoire_run_tests', { description: 'Start story or variant tests. Reuse requestKey to reconcile retries for ten minutes after completion.', inputSchema: mcpToolInputSchemas.histoire_run_tests, outputSchema: mcpToolOutputSchemas.histoire_run_tests, annotations: { ...starters, destructiveHint: true } }, (input, context) => result(context, () => operations.admit(principal, 'tests', input, context.mcpReq.signal)))
  }
  if (!hasExecutionTools(operations)) return
  server.registerTool('histoire_get_operation', { description: 'Poll exact owned operation; truncated test results are paged through operation resource.', inputSchema: mcpToolInputSchemas.histoire_get_operation, outputSchema: mcpToolOutputSchemas.histoire_get_operation, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async (input, context) => {
    try {
      observeMcpClientName(server, context, observeClientName)
      const dto = await operations.get(principal, input.operationId, context.mcpReq.signal)
      const result: CallToolResult = successResult(dto)
      if (dto.result && 'artifactUri' in dto.result) {
        const metadata = dto.result
        if (metadata.bytes <= MCP_LIMITS.inlineImageBytes) {
          const resource = await operations.readResource({ projectId, kind: 'artifact', artifactId: metadata.artifactUri.split('/').at(-1)! }, metadata.artifactUri, principal, context.mcpReq.signal)
          const content = resource.contents[0]
          if ('blob' in content) result.content.push({ type: 'image', mimeType: 'image/png', data: content.blob })
        }
        else {
          result.content.push({ type: 'resource_link', uri: metadata.artifactUri, name: 'Screenshot PNG', mimeType: 'image/png', size: metadata.bytes })
        }
      }
      if (dto.result && 'summary' in dto.result && dto.result.truncated) {
        result.content.push({ type: 'resource_link', uri: encodeMcpResourceUri({ projectId, kind: 'operation', operationId: dto.operationId, offset: 0, limit: 100 }), name: 'Full paged test result', mimeType: 'application/json' })
      }
      return result
    }
    catch (error) { return errorResult(error) }
  })
  server.registerTool('histoire_cancel_operation', { description: 'Cancel exact owned operation. Cancelling remains active until runner cleanup confirms stop.', inputSchema: mcpToolInputSchemas.histoire_cancel_operation, outputSchema: mcpToolOutputSchemas.histoire_cancel_operation, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input, context) => result(context, () => operations.cancel(principal, input.operationId, context.mcpReq.signal)))
}

/** Shared factory extension reused by dev HTTP, stdio and immutable Node server. */
export function createOperationServerExtension(operations: McpOperationToolService) {
  return {
    /** Discovery is request-local, operation state remains controller-owned. */
    register(server: McpServer, options: { principal: string, project: { projectId: string }, observeClientName?: (name: string) => void }) {
      registerOperationTools(server, operations, options.principal, options.project.projectId, options.observeClientName)
      if (!hasExecutionTools(operations)) return
      const read = (uri: URL) => operations.readResource(decodeMcpResourceUri(uri.href, options.project.projectId), uri.href, options.principal)
      server.registerResource('histoire_operation', new ResourceTemplate(`histoire://${options.project.projectId}/operations/{operationId}{?offset,limit}`, { list: undefined }), { title: 'Owned operation', mimeType: 'application/json' }, read)
      if (operations.hasExecutor('screenshot')) server.registerResource('histoire_artifact', new ResourceTemplate(`histoire://${options.project.projectId}/artifacts/{artifactId}`, { list: undefined }), { title: 'Owned screenshot PNG', mimeType: 'image/png' }, read)
    },
    readResource: operations.readResource,
  }
}
