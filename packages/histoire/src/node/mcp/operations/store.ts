import type { ExecutionService } from '../../runtime/execution-service.js'
import type { McpResourceAddress } from '../protocol/uris.js'
import type { McpExecutionCapture, McpOperationExecutor, McpOperationInput, McpOperationKind, McpOperationOutput, OperationRecord, RequestTombstone } from './types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { PreviewError } from '../../runtime/browser/errors.js'
import { readPngDimensions } from '../../runtime/browser/png.js'
import { drainExecutionHandles } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { McpDomainError, toMcpError } from '../protocol/errors.js'
import { MCP_EXECUTION_TOOLS } from '../protocol/execution-tools.js'
import { mcpInspectionResultSchema } from '../protocol/inspection-schema.js'
import { MCP_LIMITS, mcpByteLength } from '../protocol/limits.js'
import { mcpScreenshotResultSchema, mcpTestResultSchema } from '../protocol/operation-schema.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { encodeMcpResourceUri } from '../protocol/uris.js'
import { reconcileRequest, requestFingerprint, requestIdentity } from './admission.js'
import { createMcpOperationObserver } from './observer.js'
import { requireOwnedOperation, validateCapturedOperation } from './ownership.js'
import { projectOperation, projectOperationPage } from './result-pages.js'
import { operationIsTerminal, pruneOperations } from './retention.js'

/** Controller-owned bounded operation service, independent of SDK request lifetime. */
export function createMcpOperations<T>(options: {
  /** Synchronous captured authority; no target validation until after dedup. */
  capture: () => McpExecutionCapture<T>
  /** Same lane supplied to server-triggered UI fallback tests. */
  execution?: ExecutionService
  /** Adapter owns lane lifetime by default; project SDK supplies shared ownership. */
  ownsExecution?: boolean
  /** Injectable retention clock. */
  now?: () => number
  /** Captured opaque transport identity, never the authenticated principal. */
  clientIdForPrincipal?: (principal: string) => string
}) {
  const execution = options.execution ?? createExecutionService()
  const now = options.now ?? Date.now
  const records = new Map<string, OperationRecord<T>>()
  const requests = new Map<string, RequestTombstone>()
  const executors = new Map<McpOperationKind, McpOperationExecutor<T>>()
  const observer = createMcpOperationObserver(options.clientIdForPrincipal)
  let closed = false
  let closing: Promise<void> | undefined

  /** Cancels and drains only this adapter's records, leaving unrelated lane work alive. */
  async function drainOwned(epoch?: string) {
    const handles = [...records.values()].filter(record => !epoch || record.dto.epoch === epoch).flatMap(record => record.handle ? [record.handle] : [])
    await drainExecutionHandles(execution, handles)
  }

  /** Convert scheduler failures without exposing cleanup causes or stack paths. */
  function domainError(error: unknown) {
    if (!(error instanceof ExecutionError)) return error
    if (error.code === 'CLEANUP_UNCONFIRMED' && (error.cause instanceof McpDomainError || error.cause instanceof PreviewError)) return error.cause
    return new McpDomainError(error.code === 'QUEUE_FULL' ? 'QUEUE_FULL' : error.code === 'CANCELLED' ? 'CANCELLED' : 'CAPABILITY_UNAVAILABLE', error.message, error.code === 'QUEUE_FULL')
  }

  /** Exact current ownership lookup before polling or touching cancellation. */
  function owned(principal: string, operationId: string) {
    if (closed) throw new McpDomainError('OPERATION_NOT_FOUND', 'Operation is unavailable or expired')
    pruneOperations(records, requests, now())
    let current: McpExecutionCapture<T>
    try {
      current = options.capture()
    }
    catch { throw new McpDomainError('OPERATION_NOT_FOUND', 'Operation is unavailable or expired') }
    return requireOwnedOperation(records, operationId, principal, current)
  }

  /** One terminal transition records retry retention before pruning result memory. */
  function terminal(record: OperationRecord<T>, state: 'completed' | 'failed' | 'cancelled', error?: unknown) {
    if (operationIsTerminal(record.dto.state)) return
    const finished = now()
    record.dto.state = state
    record.dto.finishedAt = new Date(finished).toISOString()
    if (error) record.dto.error = toMcpError(domainError(error))
    const tombstone = requests.get(requestIdentity(record.principal, record.dto.epoch, record.input.requestKey))
    if (tombstone) tombstone.finishedAt = finished
    observer.publish(record)
    pruneOperations(records, requests, finished)
  }

  /** Validate sanitized executor output and take independent ownership of artifact bytes. */
  function retain(record: OperationRecord<T>, output: McpOperationOutput) {
    if ((output.artifact?.byteLength ?? 0) > MCP_LIMITS.artifactBytes) throw new McpDomainError('RESULT_TOO_LARGE', 'Retained screenshot exceeds storage limit')
    const result = record.dto.kind === 'tests' ? mcpTestResultSchema.parse(output.result) : record.dto.kind === 'screenshot' ? mcpScreenshotResultSchema.parse(output.result) : mcpInspectionResultSchema.parse(output.result)
    if ('inspection' in result && record.dto.kind !== (result.inspection === 'diagnostics' ? 'runtime-diagnostics' : `inspect-${result.inspection}`)) throw new McpDomainError('INTERNAL_ERROR', 'Inspection result does not match operation kind')
    if (result.storyId !== record.input.storyId || result.variantId !== record.input.variantId) throw new McpDomainError('INTERNAL_ERROR', 'Operation result does not match captured target')
    if (record.dto.kind === 'screenshot') {
      if (!output.artifact || !('bytes' in result) || result.bytes !== output.artifact.byteLength || result.sha256 !== createHash('sha256').update(output.artifact).digest('hex')) {
        throw new McpDomainError('INTERNAL_ERROR', 'Screenshot artifact does not match result metadata')
      }
      const input = mcpToolInputSchemas.histoire_capture_screenshot.parse(record.input)
      const dimensions = readPngDimensions(output.artifact)
      if (!('width' in result) || result.width !== dimensions.width || result.height !== dimensions.height
        || result.width !== input.width * input.deviceScaleFactor || result.height !== input.height * input.deviceScaleFactor) {
        throw new McpDomainError('INTERNAL_ERROR', 'Screenshot dimensions do not match captured viewport and device scale')
      }
      record.artifactId = randomUUID()
      result.artifactUri = encodeMcpResourceUri({ projectId: record.dto.projectId, kind: 'artifact', artifactId: record.artifactId })
    }
    const jsonBytes = mcpByteLength(JSON.stringify(result))
    if (jsonBytes > MCP_LIMITS.artifactBytes || (output.artifact?.byteLength ?? 0) > MCP_LIMITS.artifactBytes) {
      throw new McpDomainError('RESULT_TOO_LARGE', 'Retained operation result exceeds storage limit', false, 'summary' in result ? { total: result.summary.total, failed: result.summary.failed, passed: result.summary.passed, skipped: result.summary.skipped } : undefined)
    }
    record.output = { result, ...(output.artifact ? { artifact: Uint8Array.from(output.artifact) } : {}) }
    record.bytes = jsonBytes + (output.artifact?.byteLength ?? 0)
    // Validate bounded projection before claiming a successful retained result.
    projectOperation(record)
  }

  /** Release result bytes and retry slots with their ended runtime lifetime. */
  function discardLifetime(epoch?: string) {
    observer.discard(epoch)
    for (const [id, record] of records) {
      if (!epoch || record.dto.epoch === epoch) records.delete(id)
    }
    for (const [key, request] of requests) {
      if (!epoch || request.epoch === epoch) requests.delete(key)
    }
  }

  /** Queued cancellation removes work; active work retains lane until cleanup. */
  function cancel(principal: string, operationId: string) {
    const record = owned(principal, operationId)
    record.handle?.cancel()
    if (record.handle?.state === 'cancelled') terminal(record, 'cancelled', new McpDomainError('CANCELLED', 'Operation cancelled'))
    return projectOperation(record)
  }

  return {
    execution,
    /** Safe bounded UI activity history independent of MCP result retention. */
    snapshot: observer.snapshot,
    /** Observe lifecycle without obtaining records or result capabilities. */
    onOperationChange: observer.onOperationChange,
    /** Execution stays unavailable after unconfirmed cleanup until process restart. */
    get available() { return !closed && execution.available },
    /** Discovery reflects implemented executor registration, not package availability. */
    hasExecutor(kind: McpOperationKind) { return executors.has(kind) },
    /** Install concrete screenshot/test callbacks without duplicating admission logic. */
    registerExecutor(kind: McpOperationKind, executor: McpOperationExecutor<T>) { executors.set(kind, executor) },
    /** Atomic admission and retry reconciliation happen before any await/resources. */
    admit(principal: string, kind: McpOperationKind, input: McpOperationInput) {
      if (closed) throw new McpDomainError('PROJECT_CLOSED', 'Operation service is closed')
      input = mcpToolInputSchemas[MCP_EXECUTION_TOOLS[kind]].parse(input)
      pruneOperations(records, requests, now())
      const capture = options.capture()
      const key = requestIdentity(principal, capture.epoch, input.requestKey)
      const fingerprint = requestFingerprint(kind, input)
      const previous = reconcileRequest(requests, key, fingerprint)
      if (previous) {
        const retained = records.get(previous.operationId)
        if (!retained) throw new McpDomainError('OPERATION_NOT_FOUND', 'Request result was evicted; operation was not repeated', false, { expiredResult: true })
        return projectOperation(retained)
      }
      const executor = executors.get(kind)
      if (!executor) throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'Operation executor is unavailable')
      capture.validate(input)
      const record: OperationRecord<T> = {
        dto: { operationId: randomUUID(), projectId: capture.projectId, epoch: capture.epoch, revision: capture.revision, kind, state: 'queued', createdAt: new Date(now()).toISOString() },
        principal,
        input,
        capture,
        bytes: 0,
      }
      observer.assertCapacity(record)
      const task = executor(input, capture)
      records.set(record.dto.operationId, record)
      requests.set(key, { epoch: capture.epoch, fingerprint, operationId: record.dto.operationId })
      try {
        record.handle = execution.enqueue({
          ...task,
          principal,
          validate: () => {
            validateCapturedOperation(record)
            task.validate?.()
          },
          onState(state) {
            if (state === 'running' || state === 'cancelling') {
              record.dto.state = state
              if (state === 'running') record.dto.startedAt = new Date(now()).toISOString()
              if (state === 'running') observer.publish(record)
            }
            task.onState?.(state)
          },
        })
      }
      catch (error) {
        records.delete(record.dto.operationId)
        requests.delete(key)
        throw domainError(error)
      }
      observer.publish(record)
      void record.handle.result.then((output) => {
        try {
          validateCapturedOperation(record)
          retain(record, output)
          terminal(record, 'completed')
        }
        catch (error) {
          record.output = undefined
          record.bytes = 0
          terminal(record, 'failed', error)
        }
      }, error => terminal(record, error instanceof ExecutionError && error.code === 'CANCELLED' ? 'cancelled' : 'failed', error))
      return projectOperation(record)
    },
    /** Poll one exact random owned handle; tests are explicitly paged when needed. */
    get(principal: string, operationId: string) { return projectOperation(owned(principal, operationId)) },
    /** Queued cancellation removes work; active cancellation retains lane until cleanup. */
    cancel,
    /** Trusted dev UI reuses exact current operation ownership and cancellation. */
    cancelFromUi(operationId: string) {
      const candidate = records.get(operationId)
      if (!candidate) throw new McpDomainError('OPERATION_NOT_FOUND', 'Operation is unavailable or expired')
      cancel(candidate.principal, operationId)
    },
    /** Canonically decoded operation/artifact addresses, never global inventory. */
    readResource(address: McpResourceAddress, uri: string, principal: string) {
      if (closed) throw new McpDomainError(address.kind === 'artifact' ? 'ARTIFACT_NOT_FOUND' : 'OPERATION_NOT_FOUND', 'Resource is unavailable or expired')
      let projectId: string
      try {
        projectId = options.capture().projectId
      }
      catch { throw new McpDomainError(address.kind === 'artifact' ? 'ARTIFACT_NOT_FOUND' : 'OPERATION_NOT_FOUND', 'Resource is unavailable or expired') }
      if (address.projectId !== projectId) throw new McpDomainError(address.kind === 'artifact' ? 'ARTIFACT_NOT_FOUND' : 'OPERATION_NOT_FOUND', 'Resource is unavailable or expired')
      if (address.kind === 'operation') {
        const record = owned(principal, address.operationId)
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(projectOperationPage(record, address.offset, address.limit)) }] }
      }
      if (address.kind === 'artifact') {
        const record = [...records.values()].find(item => item.artifactId === address.artifactId)
        if (!record || !record.output?.artifact) throw new McpDomainError('ARTIFACT_NOT_FOUND', 'Artifact is unavailable or expired')
        try {
          owned(principal, record.dto.operationId)
        }
        catch { throw new McpDomainError('ARTIFACT_NOT_FOUND', 'Artifact is unavailable or expired') }
        return { contents: [{ uri, mimeType: 'image/png', blob: Buffer.from(record.output.artifact).toString('base64') }] }
      }
      throw new McpDomainError('OPERATION_NOT_FOUND', 'Operation resource is unavailable')
    },
    /** Invalidate captured authority before aborting; stale completions cannot publish. */
    invalidate(epoch?: string) {
      return drainOwned(epoch).finally(() => discardLifetime(epoch))
    },
    /** Stop admission immediately, then confirm shared lane teardown. */
    close() {
      closed = true
      return closing ??= (options.ownsExecution === false ? drainOwned() : execution.close()).finally(() => discardLifetime())
    },
  }
}

/** Shared controller-owned service consumed by SDK registration and executors. */
export type McpOperations<T = unknown> = ReturnType<typeof createMcpOperations<T>>
