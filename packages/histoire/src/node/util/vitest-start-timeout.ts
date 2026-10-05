import { HistoireSdkError } from '@histoire/protocol'

export interface VitestStartTimeoutOptions {
  /** Maximum time (ms) the run may take before it is considered stuck. */
  timeoutMs: number
  /** Message of the error thrown when the run times out. */
  message: string
  /** Prints diagnostics about the stuck run. Failures are swallowed. */
  onTimeout: () => void
}

/**
 * Runs a Vitest browser run under a safety timeout.
 *
 * `vitest.start()` can hang forever when the browser pool never finishes
 * initializing (missing Playwright browsers, a page that never loads), which
 * would wedge the CLI or a dev-server request with no output at all.
 *
 * The timer is unref'd so it never keeps the process alive on its own, and it is
 * cleared on every path (success, rejection, retry) so it can neither leak nor
 * fire on an already-closed Vitest instance.
 * @param run Starts the Vitest run.
 * @param options Timeout configuration (see {@link VitestStartTimeoutOptions}).
 */
export async function runWithVitestStartTimeout(run: () => Promise<unknown>, options: VitestStartTimeoutOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            options.onTimeout()
          }
          catch {
            // Vitest may already be torn down when a late timer fires — its
            // diagnostics must never replace the timeout error.
          }
          reject(new HistoireSdkError('TIMEOUT', options.message))
        }, options.timeoutMs)
        timer?.unref?.()
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}
