/** Waits for owned work or cancellation, removing its listener on either result. */
export async function waitForRuntimeWork<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  let onAbort: () => void
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason ?? new Error('Project runtime closed'))
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }),
    ])
  }
  finally {
    signal.removeEventListener('abort', onAbort)
  }
}
