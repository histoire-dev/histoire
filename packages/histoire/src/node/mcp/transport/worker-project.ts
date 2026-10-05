import type { McpOperationKind } from '../operations/types.js'
import type { HistoireMcpProject } from '../project/facade.js'
import type { McpOperationToolService } from '../server/operation-tools.js'
import type { createMcpWorkerClient } from './worker-client.js'
import { workerExecutionMethods } from './worker-protocol.js'

/** Create finite read proxy; parent never evaluates project configuration or runtime. */
export function createWorkerProject(worker: ReturnType<typeof createMcpWorkerClient>, projectId: string): HistoireMcpProject {
  return {
    projectId,
    getProject: signal => worker.request('getProject', {}, signal),
    listStories: (input, signal) => worker.request('listStories', input, signal),
    getStory: (input, signal) => worker.request('getStory', input, signal),
    getDocs: (input, signal) => worker.request('getDocs', input, signal),
    getSource: (input, signal) => worker.request('getSource', input, signal),
    getPreview: (input, signal) => worker.request('getPreview', input, signal),
  }
}

/** Preserve shared operation discovery/results while forwarding exact capabilities. */
export function createWorkerOperations(worker: ReturnType<typeof createMcpWorkerClient>, executors: Partial<Record<McpOperationKind, boolean>>): McpOperationToolService {
  return {
    hasExecutor: kind => executors[kind] === true,
    admit: (_principal, kind, input, signal) => worker.request(workerExecutionMethods[kind], input, signal),
    get: (_principal, operationId, signal) => worker.request('getOperation', { operationId }, signal),
    cancel: (_principal, operationId, signal) => worker.request('cancelOperation', { operationId }, signal),
    readResource: (_address, uri, _principal, signal) => worker.request('readResource', { uri }, signal),
  }
}
