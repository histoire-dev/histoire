import type { VitestLike } from './vitest-errors.js'
import { formatVitestError, getUnhandledVitestErrors } from './vitest-errors.js'

/**
 * Detects the Vitest browser failures worth one automatic retry.
 *
 * They all mean the same thing: the dependency optimizer re-bundled mid-run and
 * reloaded the page, which kills the browser connection. Nothing is wrong with
 * the stories themselves, so the run is simply started again — the second run
 * finds a warm optimizer cache.
 * @param error The error that ended the run.
 * @param vitest The Vitest instance, whose unhandled errors are inspected too:
 * the browser crash is often only reported there.
 */
export function shouldRetryVitestBrowserRun(error: unknown, vitest?: VitestLike) {
  // The browser crash is reported as a serialized plain object more often than
  // as an `Error`, so both go through the same formatter — including its stack,
  // where a nested cause mentioning the crash may be the only match.
  const messages = [
    formatVitestError(error),
    ...(vitest ? getUnhandledVitestErrors(vitest) : []),
  ].join('\n')

  return (
    messages.includes('Failed to run the test')
    || messages.includes('Browser connection was closed while running tests')
    || messages.includes('rpc is closed, cannot call "createTesters"')
  )
}
