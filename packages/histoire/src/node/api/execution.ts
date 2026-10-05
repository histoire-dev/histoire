import type { ExecutionHandle } from '../runtime/execution-types.js'
import { HISTOIRE_ERROR_CODES, HistoireSdkError } from '@histoire/protocol'
import { hasUnconfirmedCleanup } from '../runtime/cleanup.js'
import { ExecutionError } from '../runtime/execution-types.js'

/** Maps domain errors once while preserving quarantine markers for project close. */
export function toSdkExecutionError(error: unknown): unknown {
  if (hasUnconfirmedCleanup(error) || error instanceof HistoireSdkError) return error
  if (error instanceof ExecutionError) return new HistoireSdkError(error.code === 'UNAVAILABLE' ? 'CAPABILITY_UNAVAILABLE' : error.code === 'CANCELLED' ? 'CANCELLED' : 'QUEUE_FULL', error.message)
  const input = error as { code?: string, message?: string }
  if (HISTOIRE_ERROR_CODES.includes(input?.code as any)) return new HistoireSdkError(input.code as any, input.message ?? 'Histoire operation failed')
  return error
}

/** Cancellation settles only after canonical scheduler has joined owned cleanup. */
export async function awaitSdkExecution<T>(handle: ExecutionHandle<T>, signal?: AbortSignal): Promise<T> {
  const cancel = () => handle.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  try {
    return await handle.result
  }
  catch (error) { throw toSdkExecutionError(error) }
  finally { signal?.removeEventListener('abort', cancel) }
}
