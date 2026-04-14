/**
 * Minimal CLI options Histoire controls for browser story collection runs.
 */
export interface HistoireCollectionVitestCliOptions {
  reporters: Array<'verbose' | HistoireCollectionReporter>
  silent?: 'passed-only'
}

/**
 * No-op reporter used to keep successful collection passes fully silent.
 *
 * Collection failures are surfaced by Histoire after the run via
 * `assertCollectionRunOk`, so Vitest does not need to print anything here.
 */
export class HistoireCollectionReporter {}

/**
 * Builds the Vitest CLI flags used by browser story collection runs.
 */
export function getCollectionVitestCliOptions(debugBrowser = !!process.env.HST_DEBUG_BROWSER): HistoireCollectionVitestCliOptions {
  if (debugBrowser) {
    return {
      reporters: ['verbose'],
    }
  }

  return {
    reporters: [new HistoireCollectionReporter()],
    silent: 'passed-only',
  }
}
