import type { UiMcpOperationInfo } from '@histoire/shared'
import type { OperationRecord } from './types.js'
import { createHash, randomUUID } from 'node:crypto'
import { MCP_UI_EXECUTION_BYTES, trimMcpHistory } from '../observer/history.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_EXECUTION_TOOLS } from '../protocol/execution-tools.js'
import { mcpByteLength } from '../protocol/limits.js'

/** Bounded UI history; private operation authority never leaves this adapter. */
export function createMcpOperationObserver(clientIdForPrincipal?: (principal: string) => string) {
  const salt = randomUUID()
  const history = new Map<string, { epoch: string, value: UiMcpOperationInfo }>()
  const listeners = new Set<(operation: UiMcpOperationInfo) => void>()

  /** Allowlisted projection excludes inputs, result bodies, and authenticated identity. */
  function project(record: OperationRecord<unknown>): UiMcpOperationInfo {
    const previous = history.get(record.dto.operationId)
    const summary = record.output?.result && 'summary' in record.output.result ? record.output.result.summary : undefined
    return {
      id: record.dto.operationId,
      clientId: previous?.value.clientId ?? clientIdForPrincipal?.(record.principal) ?? createHash('sha256').update(salt).update(record.principal).digest('hex'),
      tool: MCP_EXECUTION_TOOLS[record.dto.kind],
      target: { storyId: record.input.storyId, ...(record.input.variantId ? { variantId: record.input.variantId } : {}) },
      state: record.dto.state === 'completed' ? 'done' : record.dto.state === 'cancelling' ? 'running' : record.dto.state,
      cancellable: !!record.handle && (record.dto.state === 'queued' || record.dto.state === 'running'),
      startedAt: record.dto.startedAt ?? record.dto.createdAt,
      ...(record.dto.finishedAt ? { endedAt: record.dto.finishedAt } : {}),
      ...(summary ? { progress: { done: summary.passed + summary.failed + summary.skipped, total: summary.total } } : {}),
    }
  }

  /** Every admitted execution remains visible; capacity rejection precedes resource allocation. */
  function assertCapacity(record: OperationRecord<unknown>) {
    const activeBytes = [...history.values()].reduce((bytes, { value }) => bytes + (value.state === 'queued' || value.state === 'running' ? mcpByteLength(JSON.stringify(value)) + 1 : 0), 2)
    if (activeBytes + mcpByteLength(JSON.stringify(project(record))) + 128 > MCP_UI_EXECUTION_BYTES) {
      throw new McpDomainError('QUEUE_FULL', 'MCP activity capacity reached', true)
    }
  }

  /** Publish independent safe DTOs only while captured runtime still owns the work. */
  function publish(record: OperationRecord<unknown>) {
    if (!record.capture.isActive()) return
    const value = project(record)
    history.set(value.id, { epoch: record.dto.epoch, value })
    trimMcpHistory(history, entry => entry.value)
    for (const listener of listeners) {
      try {
        listener(structuredClone(value))
      }
      catch { /* UI observation must never alter admission, execution, or cleanup. */ }
    }
  }

  return {
    assertCapacity,
    publish,
    /** Return independent DTOs so one consumer cannot corrupt another snapshot. */
    snapshot: () => [...history.values()].map(entry => structuredClone(entry.value)),
    /** Observe only safe lifecycle projections; caller owns its subscription. */
    onOperationChange(listener: (operation: UiMcpOperationInfo) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Drop stale running states with their captured generation. */
    discard(epoch?: string) {
      for (const [id, entry] of history) {
        if (!epoch || entry.epoch === epoch) history.delete(id)
      }
    },
  }
}
