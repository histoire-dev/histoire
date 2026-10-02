import type { ExecutionHandle, ExecutionTask } from '../../runtime/execution-types.js'
import type { McpOperation, McpScreenshotResult, McpTestResult } from '../protocol/operation-schema.js'
import type { McpToolInput } from '../protocol/tool-schema.js'

/** Implemented asynchronous operation kinds. */
export type McpOperationKind = McpOperation['kind']
/** Parsed strict starter inputs, with protocol defaults already applied. */
export type McpOperationInput = McpToolInput<'histoire_capture_screenshot'> | McpToolInput<'histoire_run_tests'>

/** Synchronous private authority captured before scheduling or awaiting. */
export interface McpExecutionCapture<T> {
  /** Controller-owned project identity. */
  projectId: string
  /** Runtime generation identity. */
  epoch: string
  /** Completed catalog revision. */
  revision: string
  /** Private runtime data supplied by dev or immutable Node artifact. */
  value: T
  /** False as soon as generation ownership is invalidated. */
  isActive: () => boolean
  /** Verify current revision, exact target and execution eligibility. */
  validate: (input: McpOperationInput) => void
}

/** Fully sanitized result; binary artifact remains separate from JSON. */
export interface McpOperationOutput {
  /** Screenshot metadata or shared test result. */
  result: McpScreenshotResult | McpTestResult
  /** Owned PNG bytes; store assigns independent artifact capability. */
  artifact?: Uint8Array
}

/** Factory does not acquire resources; resources begin inside task.run. */
export type McpOperationExecutor<T> = (input: McpOperationInput, capture: McpExecutionCapture<T>) => ExecutionTask<McpOperationOutput>

/** Controller-private record; never serialized as a whole. */
export interface OperationRecord<T> {
  /** Public lifecycle DTO. */
  dto: McpOperation
  /** Authenticated identity, not raw bearer credential. */
  principal: string
  /** Exact normalized starter arguments. */
  input: McpOperationInput
  /** Admission authority, invalidated on config restart. */
  capture: McpExecutionCapture<T>
  /** Shared lane submission. */
  handle?: ExecutionHandle<McpOperationOutput>
  /** Retained sanitized full result. */
  output?: McpOperationOutput
  /** Independent screenshot capability. */
  artifactId?: string
  /** Full retained result/artifact byte count. */
  bytes: number
}

/** Deduplication identity survives terminal record eviction. */
export interface RequestTombstone {
  /** Lifetime whose retry retention must disappear on generation release. */
  epoch: string
  /** Normalized kind/input fingerprint. */
  fingerprint: string
  /** Exact operation originally admitted. */
  operationId: string
  /** Undefined while operation is active; retention starts at terminal time. */
  finishedAt?: number
}
