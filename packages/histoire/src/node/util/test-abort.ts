import { ExecutionError } from '../runtime/execution-types.js'

/** Fail at an owned setup/read boundary before acquiring or publishing work. */
export function throwIfTestAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExecutionError('CANCELLED', 'Histoire test run cancelled')
}

/** Interrupt active work; caller must still confirm cleanup before releasing its lane. */
export async function withTestAbort<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfTestAborted(signal)
  if (!signal) return work()
  let listener: () => void
  const aborted = new Promise<never>((_, reject) => {
    listener = () => reject(new ExecutionError('CANCELLED', 'Histoire test run cancelled'))
    signal.addEventListener('abort', listener, { once: true })
  })
  try {
    return await Promise.race([Promise.resolve().then(work), aborted])
  }
  finally { signal.removeEventListener('abort', listener!) }
}
