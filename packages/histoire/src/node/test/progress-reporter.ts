/** Finished specs out of the specs of one Vitest run. */
export interface HistoireSpecProgress {
  /** Specs that finished. */
  completed: number
  /** Specs in the run. */
  total: number
}

/** Progress of a test run: story collection (one spec per story), then assertions (one per variant). */
export interface HistoireTestRunProgress extends HistoireSpecProgress {
  /** Current phase. */
  phase: 'collect' | 'run'
}

/**
 * Vitest options appending a reporter that reports finished specs (test modules), to spread
 * after the run options. Each attempt restarts the count. Without a listener it is empty,
 * since an explicit `reporters: undefined` breaks Vitest config resolution.
 * @param reporters Reporters configured for the run; Vitest's `default` when absent.
 * @param total Number of specs in the run.
 * @param onProgress Receives counts after the run starts and after every finished spec.
 */
export function progressReporterOptions(reporters: unknown, total: number, onProgress?: (progress: HistoireSpecProgress) => void): { reporters?: any } {
  if (!onProgress) return {}
  let completed = 0
  const reporter = {
    onTestRunStart() {
      completed = 0
      onProgress({ completed, total })
    },
    onTestModuleEnd() {
      completed = Math.min(completed + 1, total)
      onProgress({ completed, total })
    },
  }
  const configured = reporters === undefined ? ['default'] : Array.isArray(reporters) ? reporters : [reporters]
  return { reporters: [...configured, reporter] }
}
