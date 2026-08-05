import type { InlineConfig as ViteInlineConfig } from 'vite'
import type { Vitest } from 'vitest/node'
import pc from 'picocolors'
import { createVitest } from 'vitest/node'
import { cleanupVitestBrowserRun } from '../vitest-browser-cleanup.js'
import { assignVitestBrowserProjectOptions } from '../vitest-browser-config/index.js'
import { CLEANUP_TIMEOUT } from './test-timeouts.js'
import { formatVitestError } from './vitest-errors.js'
import { shouldRetryVitestBrowserRun } from './vitest-retry.js'
import { runWithVitestStartTimeout } from './vitest-start-timeout.js'

/**
 * Everything one attempt of a Vitest browser run needs.
 *
 * Rebuilt for every attempt: the config carries live plugin instances bound to
 * the Vite server of the attempt that created them, and reusing them across two
 * Vitest servers hands the second one already-closed handles.
 */
export interface VitestAttemptSetup<TContext> {
  /** Options passed to `createVitest`. */
  vitestOptions: Record<string, any>
  /** Vite config passed to `createVitest`. */
  viteConfig?: ViteInlineConfig
  /** Project-level browser options assigned right after creation. */
  browserProjectOptions?: { plugins: any[] }
  /** Test name filters passed to `vitest.start()`. */
  filter?: string[]
  /** Maximum time `vitest.start()` may take before the run is considered stuck. */
  timeoutMs: number
  /** Message of the error thrown when the start times out. */
  timeoutMessage: string
  /** Prints diagnostics about a stuck run. */
  onTimeout?: (vitest: Vitest) => void
  /** Attempt-scoped data (generated specs, result channel…) handed to `read`. */
  context: TContext
}

export interface RunVitestAttemptsOptions<TContext, TResult> {
  /** Human-readable name of the run, used in cleanup diagnostics. */
  label: string
  /** Warning printed when the run is retried. */
  retryMessage: string
  /** How many times the run may be retried after a browser crash. */
  maxRetries?: number
  /** Builds the setup of one attempt (see {@link VitestAttemptSetup}). */
  setup: () => Promise<VitestAttemptSetup<TContext>>
  /** Reads the finished run; its return value is the result of the whole run. */
  read: (vitest: Vitest, context: TContext) => TResult | Promise<TResult>
}

/**
 * Tears down a Vitest browser run without ever letting the teardown failure
 * escape.
 *
 * `cleanupVitestBrowserRun` propagates a genuine cleanup rejection, which would
 * either discard the results of an already-successful run, or — on the failure
 * path — replace the real error (hiding the actual cause) and skip the
 * browser-crash retry that follows it. The teardown failure is therefore
 * reported as a warning, and attached to the original error when there is one.
 * @param vitest The Vitest instance to tear down.
 * @param label Human-readable name of the run.
 * @param originalError The error currently being handled, if any.
 */
async function cleanupRun(vitest: Vitest, label: string, originalError?: unknown) {
  try {
    await cleanupVitestBrowserRun(vitest, { label, timeoutMs: CLEANUP_TIMEOUT })
  }
  catch (cleanupError) {
    console.warn(pc.yellow(`${label} cleanup failed: ${formatVitestError(cleanupError)}`))
    // Keep the teardown failure reachable for debugging, but never overwrite an
    // existing cause chain of the error that actually failed the run.
    if (originalError instanceof Error && originalError.cause === undefined) {
      originalError.cause = cleanupError
    }
  }
}

/**
 * Runs a Vitest browser run, retrying it once when the browser crashed.
 *
 * Shared by the story collection and the test execution: both create a Vitest
 * instance from a freshly built config, start it under a safety timeout, read
 * the outcome and tear the instance down on every path.
 * @param options Run configuration (see {@link RunVitestAttemptsOptions}).
 */
export async function runVitestAttempts<TContext, TResult>(
  options: RunVitestAttemptsOptions<TContext, TResult>,
): Promise<TResult> {
  const maxRetries = options.maxRetries ?? 1
  let retryCount = 0

  while (true) {
    const setup = await options.setup()
    let vitest: Vitest | undefined

    try {
      vitest = await createVitest('test', setup.vitestOptions as any, setup.viteConfig as any)
      if (setup.browserProjectOptions) {
        assignVitestBrowserProjectOptions(vitest, setup.browserProjectOptions)
      }

      await runWithVitestStartTimeout(() => vitest!.start(setup.filter ?? []), {
        timeoutMs: setup.timeoutMs,
        message: setup.timeoutMessage,
        onTimeout: () => setup.onTimeout?.(vitest!),
      })

      const result = await options.read(vitest, setup.context)
      await cleanupRun(vitest, options.label)
      return result
    }
    catch (error) {
      if (vitest) {
        await cleanupRun(vitest, options.label, error)
      }

      if (retryCount < maxRetries && shouldRetryVitestBrowserRun(error, vitest)) {
        retryCount++
        console.warn(pc.yellow(options.retryMessage))
        continue
      }

      throw error
    }
  }
}
