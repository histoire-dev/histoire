import { HistoireSdkError } from '@histoire/protocol'

/** Progress signal of a run: each `touch()` restarts its stall timeout. */
export interface VitestRunActivity {
  /** Reports progress (a finished spec). */
  touch: () => void
  /** Sets the listener notified on every `touch()`. */
  listen: (listener: (() => void) | undefined) => void
}

/** Creates the progress signal a run's reporter touches and its stall timeout listens to. */
export function createVitestRunActivity(): VitestRunActivity {
  let listener: (() => void) | undefined
  return {
    touch: () => listener?.(),
    listen: (next) => { listener = next },
  }
}

export interface VitestStartTimeoutOptions {
  /** Maximum time (ms) the run may take, or go without activity when `activity` is set, before it is considered stuck. */
  timeoutMs: number
  /** Restarts the timer on every progress report, turning it into a stall timeout. */
  activity?: VitestRunActivity
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
        /** (Re)starts the countdown; with an activity signal every progress report calls it again. */
        const arm = () => {
          clearTimeout(timer)
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
        }
        options.activity?.listen(arm)
        arm()
      }),
    ])
  }
  finally {
    options.activity?.listen(undefined)
    clearTimeout(timer)
  }
}
