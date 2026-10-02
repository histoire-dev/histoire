import type { McpExecutionCapture, OperationRecord } from './types.js'
import { McpDomainError } from '../protocol/errors.js'

/** Exact random capability plus principal/project/epoch checks disclose no foreign job. */
export function requireOwnedOperation<T>(records: Map<string, OperationRecord<T>>, operationId: string, principal: string, current: McpExecutionCapture<T>) {
  const record = records.get(operationId)
  if (!record || record.principal !== principal || record.dto.projectId !== current.projectId || record.dto.epoch !== current.epoch) {
    throw new McpDomainError('OPERATION_NOT_FOUND', 'Operation is unavailable or expired')
  }
  return record
}

/** Prevent queued work and late completion from publishing obsolete runtime data. */
export function validateCapturedOperation<T>(record: OperationRecord<T>) {
  if (!record.capture.isActive()) throw new McpDomainError('STALE_REVISION', 'Operation runtime generation changed', true)
  record.capture.validate({ ...record.input, expectedRevision: record.dto.revision })
}
