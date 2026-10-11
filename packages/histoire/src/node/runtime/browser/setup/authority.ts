import { waitForRuntimeWork } from '../../wait.js'
import { PreviewError } from '../errors.js'

/** Rejects cancelled, expired, or retired setup work without treating refresh as cancellation. */
export function assertSetupAuthority(signal: AbortSignal, deadline: number, isActive: () => boolean): void {
  if (signal.aborted || !isActive()) throw new PreviewError('CANCELLED', 'Browser setup operation cancelled')
  if (deadline <= Date.now()) throw new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true)
}

/** Waits for shared setup metadata without letting caller authority outlive it. */
export async function awaitSetupWork<T>(
  work: Promise<T>,
  signal: AbortSignal,
  deadline: number,
  isActive: () => boolean,
): Promise<T> {
  // Discovery can still complete after this acquisition stops; observe late failures.
  void work.catch(() => {})
  assertSetupAuthority(signal, deadline, isActive)

  const stopped = new AbortController()
  const cancel = () => {
    if (!stopped.signal.aborted) stopped.abort(new PreviewError('CANCELLED', 'Browser setup operation cancelled'))
  }
  const onAbort = () => cancel()
  signal.addEventListener('abort', onAbort, { once: true })
  const checkActive = () => {
    if (!isActive()) cancel()
  }
  const activityCheck = setInterval(checkActive, 20)
  const deadlineTimer = setTimeout(() => {
    if (!stopped.signal.aborted) stopped.abort(new PreviewError('TIMEOUT', 'Browser setup exceeded its deadline', true))
  }, Math.max(1, deadline - Date.now()))

  try {
    if (signal.aborted || !isActive()) cancel()
    const value = await waitForRuntimeWork(work, stopped.signal)
    if (stopped.signal.aborted) throw stopped.signal.reason
    assertSetupAuthority(signal, deadline, isActive)
    return value
  }
  catch (error) {
    // Preserve existing setup error precedence when the stop races a late result.
    assertSetupAuthority(signal, deadline, isActive)
    if (stopped.signal.aborted) throw stopped.signal.reason
    throw error
  }
  finally {
    signal.removeEventListener('abort', onAbort)
    clearTimeout(deadlineTimer)
    clearInterval(activityCheck)
  }
}
