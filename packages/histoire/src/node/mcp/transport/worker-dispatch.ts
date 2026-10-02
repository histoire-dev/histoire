import type { HistoireMcpProject } from '../project/facade.js'
import type { McpOperationToolService } from '../server/operation-tools.js'
import type { WorkerMethod } from './worker-protocol.js'
import { McpDomainError } from '../protocol/errors.js'
import { decodeMcpResourceUri } from '../protocol/uris.js'
import { parseWorkerInput } from './worker-protocol.js'

/** Dispatch fixed facade methods using one process-scoped authenticated principal. */
export async function dispatchWorkerRequest(options: { project: HistoireMcpProject, operations: McpOperationToolService, principal: string }, method: WorkerMethod, input: unknown, signal: AbortSignal) {
  signal.throwIfAborted()
  let result: unknown
  switch (method) {
    case 'getProject':
      parseWorkerInput('getProject', input)
      result = await options.project.getProject(signal)
      break
    case 'listStories':
      result = await options.project.listStories(parseWorkerInput('listStories', input), signal)
      break
    case 'getStory':
      result = await options.project.getStory(parseWorkerInput('getStory', input), signal)
      break
    case 'getDocs':
      result = await options.project.getDocs(parseWorkerInput('getDocs', input), signal)
      break
    case 'getSource':
      result = await options.project.getSource(parseWorkerInput('getSource', input), signal)
      break
    case 'getPreview':
      result = await options.project.getPreview(parseWorkerInput('getPreview', input), signal)
      break
    case 'admitScreenshot':
      result = await options.operations.admit(options.principal, 'screenshot', parseWorkerInput('admitScreenshot', input), signal)
      break
    case 'admitTests':
      result = await options.operations.admit(options.principal, 'tests', parseWorkerInput('admitTests', input), signal)
      break
    case 'getOperation':
      result = await options.operations.get(options.principal, parseWorkerInput('getOperation', input).operationId, signal)
      break
    case 'cancelOperation':
      result = await options.operations.cancel(options.principal, parseWorkerInput('cancelOperation', input).operationId, signal)
      break
    case 'readResource': {
      const parsed = parseWorkerInput('readResource', input)
      const address = decodeMcpResourceUri(parsed.uri, options.project.projectId)
      if (address.kind !== 'operation' && address.kind !== 'artifact') throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'Worker resource kind is unavailable')
      result = await options.operations.readResource(address, parsed.uri, options.principal, signal)
      break
    }
    default: throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'Worker method is unavailable')
  }
  // Cancellation of admission drops its reply only; accepted work remains
  // recoverable by the caller's original requestKey or explicit operation tool.
  signal.throwIfAborted()
  return result
}
