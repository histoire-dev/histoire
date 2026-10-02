import type { OperationRecord, RequestTombstone } from './types.js'
import { MCP_LIMITS } from '../protocol/limits.js'

/** Whether record may be evicted; running/queued/cancelling work is never evicted. */
export function operationIsTerminal(state: string) {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
}

/** Expire tombstones separately from FIFO terminal record/count/byte retention. */
export function pruneOperations<T>(records: Map<string, OperationRecord<T>>, requests: Map<string, RequestTombstone>, now: number) {
  for (const [key, request] of requests) {
    if (request.finishedAt !== undefined && request.finishedAt + MCP_LIMITS.retentionMs <= now) requests.delete(key)
  }
  const terminal = [...records.values()].filter(record => operationIsTerminal(record.dto.state)).sort((left, right) => Date.parse(left.dto.finishedAt!) - Date.parse(right.dto.finishedAt!))
  let bytes = terminal.reduce((total, record) => total + record.bytes, 0)
  let count = terminal.length
  for (const record of terminal) {
    if (Date.parse(record.dto.finishedAt!) + MCP_LIMITS.retentionMs <= now || count > MCP_LIMITS.terminalOperations || bytes > MCP_LIMITS.storageBytes) {
      records.delete(record.dto.operationId)
      bytes -= record.bytes
      count--
    }
  }
}
