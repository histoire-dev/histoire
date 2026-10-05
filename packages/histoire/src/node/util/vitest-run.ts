import type { InlineConfig as ViteInlineConfig } from 'vite'
import type { Vitest } from 'vitest/node'
import pc from 'picocolors'
import { ExecutionError } from '../runtime/execution-types.js'
import { cleanupVitestBrowserRun } from '../vitest-browser-cleanup.js'
import { assignVitestBrowserProjectOptions } from '../vitest-browser-config/index.js'
import { loadProjectVitest } from './project-vitest.js'
import { throwIfTestAborted, withTestAbort } from './test-abort.js'
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
  /** Collection executes modules without executing assertion bodies or lifecycle hooks. */
  mode?: 'run' | 'collect'
  /** Project install used for Node and browser Vitest APIs. */
  root: string
  /** Controller-owned cancellation. */
  signal?: AbortSignal
  /** Require confirmed runner/server teardown before lane reuse. */
  strictCleanup?: boolean
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
 * Tear down a run. Controller-owned runs reject any unconfirmed cleanup; CLI
 * callers retain best-effort warnings.
 *
 * Strict cleanup failure blocks the shared execution lane even when assertions
 * finished successfully. Best-effort CLI cleanup warns and retains the original
 * run error so diagnostics and existing browser-crash retry remain useful.
 * @param vitest The Vitest instance to tear down.
 * @param label Human-readable name of the run.
 * @param originalError The error currently being handled, if any.
 * @param strict Require confirmed teardown for a long-lived shared execution lane.
 */
async function cleanupRun(vitest: Vitest, label: string, originalError?: unknown, strict = false) {
  try {
    const outcome = await cleanupVitestBrowserRun(vitest, { label, timeoutMs: CLEANUP_TIMEOUT })
    if (strict && outcome?.status === 'unconfirmed') {
      throw new ExecutionError('CLEANUP_UNCONFIRMED', `${label} cleanup could not be confirmed`, originalError)
    }
  }
  catch (cleanupError) {
    if (strict) throw new ExecutionError('CLEANUP_UNCONFIRMED', `${label} cleanup could not be confirmed`, cleanupError)
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
    throwIfTestAborted(options.signal)
    const setup = await options.setup()
    throwIfTestAborted(options.signal)
    const api = await loadProjectVitest(options.root)
    throwIfTestAborted(options.signal)
    let vitest: Vitest | undefined
    let cleanupStarted = false

    try {
      // Observe late creation even after abort: only the acquired handle can confirm teardown.
      vitest = await api.createVitest('test', setup.vitestOptions as any, setup.viteConfig as any)
      throwIfTestAborted(options.signal)
      if (setup.browserProjectOptions) {
        assignVitestBrowserProjectOptions(vitest, setup.browserProjectOptions)
      }

      await runWithVitestStartTimeout(() => withTestAbort(() => options.mode === 'collect' ? vitest!.collect(setup.filter ?? [], { staticParse: false }) : vitest!.start(setup.filter ?? []), options.signal), {
        timeoutMs: setup.timeoutMs,
        message: setup.timeoutMessage,
        onTimeout: () => setup.onTimeout?.(vitest!),
      })

      throwIfTestAborted(options.signal)
      const result = await options.read(vitest, setup.context)
      throwIfTestAborted(options.signal)
      cleanupStarted = true
      await cleanupRun(vitest, options.label, undefined, options.strictCleanup)
      return result
    }
    catch (error) {
      if (vitest && !cleanupStarted) {
        if (options.signal?.aborted) {
          // Vitest must stop queued testers before browser teardown. Otherwise
          // closing its RPC page is classified as a fatal run, and late pool
          // work can exit the isolated worker without a cleanup acknowledgement.
          // Resource release still waits for cleanupRun, even if cancellation fails.
          void vitest.cancelCurrentRun?.('keyboard-input').catch(() => {})
        }
        await cleanupRun(vitest, options.label, error, options.strictCleanup)
      }

      throwIfTestAborted(options.signal)
      if (retryCount < maxRetries && shouldRetryVitestBrowserRun(error, vitest)) {
        retryCount++
        console.warn(pc.yellow(options.retryMessage))
        continue
      }

      throw error
    }
  }
}
