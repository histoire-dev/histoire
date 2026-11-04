import type { PublicState, RuntimeStatus } from '@histoire/dev-proxy/protocol'
import type { ProgressEvent, RestartCause, StartupPhaseId } from '../protocol/progress.js'
import { performance } from 'node:perf_hooks'
import { sanitizeLine } from '../output/sanitize.js'

/** State of one phase as seen by the parent. */
export interface PhaseSnapshot {
  phase: StartupPhaseId
  /** `interrupted` marks work that was running when its generation retired. */
  status: 'running' | 'completed' | 'failed' | 'skipped' | 'interrupted'
  /** Current detail such as a plugin name; skip reason on `skipped`. */
  label?: string
  /** Loaded units, present only with a real `total`. */
  current?: number
  total?: number
  /** Work that does not gate readiness. */
  background: boolean
  /** Live monotonic elapsed time while running, final duration afterwards. */
  elapsedMs: number
  /** Failure line, on `failed`. */
  error?: string
}

/** Point-in-time view of the current generation's startup. */
export interface ProgressSnapshot {
  /** Lifecycle mirrored from the proxy. */
  status: RuntimeStatus
  /** Generation the phases belong to; undefined before the first spawn. */
  generation?: string
  /** The generation bypasses cached catalog and forces dependency optimization. */
  fresh: boolean
  /** Reason of the restart that produced this generation; undefined for the initial start. */
  cause?: RestartCause
  /** Time since the current transition began (frozen once ready, failed or closed). */
  elapsedMs: number
  /** Total time the last transition took to reach `ready`. */
  readyAfterMs?: number
  /** Every phase observed for this generation, in start order. */
  phases: PhaseSnapshot[]
  /** Foreground and background phases still running. */
  active: PhaseSnapshot[]
  /** The phase that failed, kept visible until the next generation spawns. */
  failed?: PhaseSnapshot
}

/** Mutable record of one observed phase. */
interface PhaseRecord {
  phase: StartupPhaseId
  status: PhaseSnapshot['status']
  label?: string
  current?: number
  total?: number
  background: boolean
  startedAt: number
  durationMs?: number
  error?: string
}

/** Mutable record of one generation. */
interface GenerationRecord {
  generation: string
  fresh: boolean
  cause?: RestartCause
  phases: Map<StartupPhaseId, PhaseRecord>
  retired: boolean
}

/** Retired generations remembered so late frames are fenced; far above any restart burst. */
const RETIRED_MEMORY = 64

/** Parent-side, session-lifetime mirror of startup progress and restart causes. */
export interface ProgressState {
  /** Feeds proxy `onStatus` (only status and generation are read). */
  onStatus: (state: Pick<PublicState, 'status'>) => void
  /** Feeds proxy `onRuntimeStart`: opens a new generation, replacing the previous record. */
  onRuntimeStart: (info: { generation: string, fresh: boolean }) => void
  /** Feeds proxy `onRestart`: the cause is attached to the next spawned generation. */
  onRestart: (cause: RestartCause) => void
  /** Feeds a validated `progress` bridge event; frames of non-current or retired generations are ignored. */
  onProgress: (generation: string, event: ProgressEvent) => void
  /** Feeds proxy `onRuntimeRetired`: running phases of that generation become `interrupted`. */
  onRetired: (generation: string) => void
  /** Computes the current view; elapsed values are live. */
  snapshot: () => ProgressSnapshot
  /** Observes every change (not clock ticks). Returns an unsubscribe function. */
  subscribe: (listener: (snapshot: ProgressSnapshot) => void) => () => void
}

/**
 * Creates the progress mirror. Pure state: no I/O, no runtime imports.
 * Child-provided text (labels, failure lines, restart sources) is made terminal-safe on ingestion.
 * @param options Optional injected monotonic clock (`now`, milliseconds; tests only) and credentials to redact.
 * @param options.now Monotonic clock in milliseconds.
 * @param options.secrets Configured credentials removed from child text.
 */
export function createProgressState(options: { now?: () => number, secrets?: readonly string[] } = {}): ProgressState {
  const now = options.now ?? (() => performance.now())
  const clean = (text: string) => sanitizeLine(text, options.secrets)
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>()
  const retired = new Set<string>()
  let status: RuntimeStatus = 'starting'
  let current: GenerationRecord | undefined
  /** Cause of the latest restart transition; every generation it spawns shares it. */
  let transitionCause: RestartCause | undefined
  let transitionStartedAt = now()
  let endedAt: number | undefined
  let readyAfterMs: number | undefined

  /** Notifies listeners; one faulty listener never affects the others. */
  function changed() {
    if (!listeners.size) return
    const snapshot = view()
    for (const listener of [...listeners]) {
      try {
        listener(snapshot)
      }
      catch {}
    }
  }

  /** Converts a record into its public form with a live elapsed value. */
  function toSnapshot(record: PhaseRecord): PhaseSnapshot {
    const { startedAt, durationMs, ...rest } = record
    return { ...rest, elapsedMs: record.status === 'running' ? Math.max(0, now() - startedAt) : durationMs ?? 0 }
  }

  /** Builds the snapshot. */
  function view(): ProgressSnapshot {
    const phases = [...current?.phases.values() ?? []].map(toSnapshot)
    return {
      status,
      generation: current?.generation,
      fresh: current?.fresh ?? false,
      cause: current?.cause ?? (status === 'restarting' ? transitionCause : undefined),
      elapsedMs: Math.max(0, (endedAt ?? now()) - transitionStartedAt),
      ...(readyAfterMs === undefined ? {} : { readyAfterMs }),
      phases,
      active: phases.filter(phase => phase.status === 'running'),
      failed: phases.find(phase => phase.status === 'failed'),
    }
  }

  /** Marks running phases of a record as no longer progressing. */
  function interrupt(record: GenerationRecord) {
    record.retired = true
    for (const phase of record.phases.values()) {
      if (phase.status === 'running') {
        phase.status = 'interrupted'
        phase.durationMs = Math.max(0, now() - phase.startedAt)
      }
    }
  }

  return {
    onStatus(next) {
      if (next.status === status) return
      const previous = status
      status = next.status
      if (status === 'restarting' || (status === 'starting' && previous !== 'restarting')) {
        transitionStartedAt = now()
        endedAt = undefined
        readyAfterMs = undefined
      }
      // The retiring generation's phases no longer describe the transition.
      if (status === 'restarting') {
        if (current && !current.retired) interrupt(current)
        current = undefined
      }
      else if (status === 'ready' || status === 'failed' || status === 'closed') {
        endedAt = now()
        if (status === 'ready') readyAfterMs = endedAt - transitionStartedAt
      }
      changed()
    },
    onRuntimeStart({ generation, fresh }) {
      if (current && !current.retired) interrupt(current)
      current = { generation, fresh, cause: transitionCause, phases: new Map(), retired: false }
      changed()
    },
    onRestart(cause) {
      transitionCause = cause.source === undefined ? cause : { ...cause, source: clean(cause.source) }
      changed()
    },
    onProgress(generation, rawEvent) {
      if (!current || current.generation !== generation || current.retired || retired.has(generation)) return
      const event: ProgressEvent = {
        ...rawEvent,
        ...(rawEvent.label === undefined ? {} : { label: clean(rawEvent.label) }),
        ...(rawEvent.error === undefined ? {} : { error: clean(rawEvent.error) }),
      }
      const phases = current.phases
      const existing = phases.get(event.phase)
      if (event.status === 'started') {
        phases.set(event.phase, { phase: event.phase, status: 'running', background: event.background === true, startedAt: now(), ...(event.label ? { label: event.label } : {}) })
      }
      else if (event.status === 'skipped') {
        phases.set(event.phase, { phase: event.phase, status: 'skipped', background: false, startedAt: now(), durationMs: 0, ...(event.label ? { label: event.label } : {}) })
      }
      else if (existing?.status === 'running') {
        if (event.label !== undefined) existing.label = event.label
        if (event.current !== undefined && event.total !== undefined) {
          existing.current = event.current
          existing.total = event.total
        }
        if (event.status !== 'updated') {
          existing.status = event.status
          existing.durationMs = event.durationMs ?? Math.max(0, now() - existing.startedAt)
          if (event.error) existing.error = event.error
        }
      }
      else {
        return
      }
      changed()
    },
    onRetired(generation) {
      retired.add(generation)
      if (retired.size > RETIRED_MEMORY) retired.delete(retired.values().next().value!)
      if (current?.generation === generation && !current.retired) {
        interrupt(current)
        changed()
      }
    },
    snapshot: view,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
