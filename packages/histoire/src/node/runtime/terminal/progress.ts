import type { ProgressEvent, StartupPhaseId } from '@histoire/cli/protocol/progress'
import { performance } from 'node:perf_hooks'
import { describeProgressError } from '@histoire/cli/protocol/progress'

/** Fastest cadence of count-only updates; the final count is always published. */
const UPDATE_INTERVAL_MS = 100

/** Mutable detail a running phase can report. */
export interface ProgressPatch {
  label?: string
  current?: number
  total?: number
}

/**
 * Producer of real startup work observations. Every method is inert once the
 * generation is superseded, and absent observers cost nothing.
 */
export interface StartupProgress {
  /**
   * Starts a phase; restarting a running phase is ignored.
   * @param phase Phase identifier.
   * @param label Optional current detail.
   * @param options.background Marks work that does not gate readiness.
   */
  begin: (phase: StartupPhaseId, label?: string, options?: { background?: boolean }) => void
  /** Reports a changed label or count of a running phase; ignored otherwise. */
  update: (phase: StartupPhaseId, patch: ProgressPatch) => void
  /** Finishes a running phase successfully. */
  complete: (phase: StartupPhaseId) => void
  /** Finishes a running phase with a failure. */
  fail: (phase: StartupPhaseId, error: unknown) => void
  /** Records work that was deliberately not performed. */
  skip: (phase: StartupPhaseId, label?: string) => void
  /** Runs `work` as one phase, completing or failing it with the outcome. */
  track: <T>(phase: StartupPhaseId, work: () => T | Promise<T>, label?: string) => Promise<T>
}

/** Observer that records nothing; used when no sink is supplied. */
export const inertProgress: StartupProgress = {
  begin() {},
  update() {},
  complete() {},
  fail() {},
  skip() {},
  track: async (_phase, work) => work(),
}

/** Bookkeeping of one running phase. */
interface RunningPhase {
  startedAt: number
  background: boolean
  lastUpdateAt: number
}

/**
 * Creates a progress producer.
 * @param sink Receives each observation; faults are swallowed. Absent means inert.
 * @param isActive Publication stops permanently the first time this returns false.
 * @param now Monotonic clock in milliseconds; tests only.
 */
export function createStartupProgress(sink: ((event: ProgressEvent) => void) | undefined, isActive: () => boolean = () => true, now: () => number = () => performance.now()): StartupProgress {
  if (!sink) return inertProgress
  const running = new Map<StartupPhaseId, RunningPhase>()
  let superseded = false

  /** Publishes unless the owning generation was superseded. */
  function publish(event: ProgressEvent) {
    superseded ||= !isActive()
    if (superseded) return
    try {
      sink!(event)
    }
    catch {}
  }

  /** Removes a running phase and returns its monotonic duration. */
  function finish(phase: StartupPhaseId) {
    const entry = running.get(phase)
    if (!entry) return undefined
    running.delete(phase)
    return { durationMs: Math.max(0, Math.round(now() - entry.startedAt)), ...(entry.background ? { background: true } : {}) }
  }

  const progress: StartupProgress = {
    begin(phase, label, options) {
      if (running.has(phase)) return
      const background = options?.background === true
      running.set(phase, { startedAt: now(), background, lastUpdateAt: -Infinity })
      publish({ phase, status: 'started', ...(label ? { label } : {}), ...(background ? { background } : {}) })
    },
    update(phase, patch) {
      const entry = running.get(phase)
      if (!entry) return
      const time = now()
      const final = patch.total !== undefined && patch.current === patch.total
      // Per-file counts can arrive in bursts; label changes and the last count always pass.
      if (patch.label === undefined && !final && time - entry.lastUpdateAt < UPDATE_INTERVAL_MS) return
      entry.lastUpdateAt = time
      publish({ phase, status: 'updated', ...patch, ...(entry.background ? { background: true } : {}) })
    },
    complete(phase) {
      const done = finish(phase)
      if (done) publish({ phase, status: 'completed', ...done })
    },
    fail(phase, error) {
      const done = finish(phase)
      if (done) publish({ phase, status: 'failed', ...done, error: describeProgressError(error) })
    },
    skip(phase, label) {
      publish({ phase, status: 'skipped', ...(label ? { label } : {}) })
    },
    async track(phase, work, label) {
      progress.begin(phase, label)
      try {
        const result = await work()
        progress.complete(phase)
        return result
      }
      catch (error) {
        progress.fail(phase, error)
        throw error
      }
    },
  }
  return progress
}
