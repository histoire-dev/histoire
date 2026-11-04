import type { TestOperationDto, TestTarget } from '@histoire/cli/protocol/tests'
import type { WatchPhase, WatchSetArgs, WatchStateDto } from '@histoire/cli/protocol/watch'
import type { AffectedSelector } from '../affected/selector.js'
import type { AffectedChange } from '../affected/types.js'
import type { TestsService } from '../tests/service.js'
import type { CollectionBarrier, CollectionBarrierOptions } from './barrier.js'
import { boundReason } from '@histoire/cli/protocol/watch'
import { createCollectionBarrier } from './barrier.js'
import { createPendingSet } from './pending.js'
import { classifyRefusal, judgeSettled, planAdmission } from './plan.js'

/** Inputs of one per-generation watch scheduler. */
export interface WatchSchedulerOptions {
  /** Affected-story classification and selection (slice 09); the scheduler never reimplements either. */
  selector: Pick<AffectedSelector, 'onChange' | 'select' | 'refresh' | 'attach' | 'detach'>
  /** Terminal test service; every run goes through its scoped lane owner. */
  tests: Pick<TestsService, 'run' | 'runAffected' | 'cancel'>
  /** Canonical catalog of the generation. */
  catalog: CollectionBarrierOptions['catalog']
  /** Collection observations of the generation. */
  onCollection: CollectionBarrierOptions['onCollection']
  /** Receives every state change (dropped by the adapter once the generation retires). */
  emit: (state: WatchStateDto) => void
  /** Aborted when the generation is released: everything stops and nothing is rescheduled. */
  signal: AbortSignal
  /** Quiet period after the last edit before a run is admitted. */
  settleMs?: number
  /** Backoff bounds for a full execution queue. */
  retryMs?: { initial: number, max: number }
}

/** The run the watch currently owns, from admission until the lane confirmed cleanup. */
interface OwnedRun {
  run: ReturnType<TestsService['run']>
  /** Enable/disable/retarget generation that admitted it. */
  session: number
  /** Stories of an affected batch (empty when the run was the exact scope). */
  storyIds: string[]
  /** Cancellation was requested because the run became stale. */
  cancelled: boolean
}

/** Why the scheduler stands still until something meaningful happens. */
interface Pause {
  /** `target`: scope vanished. `run`: admission or the runner failed. */
  kind: 'target' | 'run'
  reason: string
}

/**
 * Affected-story watch of one runtime generation. It combines classified edits
 * (09), the collection barrier and the terminal test service (07):
 * - an edit joins the pending set; an owned stale run is cancelled, its
 *   unvalidated targets go back into the set, and a successor is admitted only
 *   after the lane confirmed cleanup, collection is usable and edits settled;
 * - admission claims the set atomically and restores it if refused;
 * - failures pause (never retried in a loop, never broadened to another scope);
 * - disabling or releasing the generation bumps `session`/`dead` first, so a
 *   late completion can never reschedule.
 * It never awaits a test run inside a collection handler.
 * @param options Generation-scoped capabilities.
 */
export function createWatchScheduler(options: WatchSchedulerOptions) {
  const settleMs = options.settleMs ?? 250
  const retry = options.retryMs ?? { initial: 1000, max: 10_000 }
  const pending = createPendingSet()
  let barrier!: CollectionBarrier
  let enabled = false
  let scope: TestTarget = { scope: 'all' }
  let session = 0
  let phase: WatchPhase = 'off'
  let reason: string | undefined
  let runs = 0
  let operationId: string | undefined
  let owned: OwnedRun | undefined
  let pause: Pause | undefined
  let analyzing = false
  let analyzed = false
  let attempt = 0
  let quietUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastKey = ''
  let dead = false

  /** Current snapshot. */
  function state(): WatchStateDto {
    return { enabled, phase, ...(enabled ? { scope } : {}), ...(reason ? { reason } : {}), pending: pending.size, ...(operationId ? { operationId } : {}), runs }
  }

  /** Emits the snapshot when it differs from the last one. */
  function publish() {
    if (dead) return
    const snapshot = state()
    const key = JSON.stringify(snapshot)
    if (key === lastKey) return
    lastKey = key
    options.emit(snapshot)
  }

  /** Moves to a phase with an optional reason. */
  function setPhase(next: WatchPhase, why?: string) {
    phase = next
    reason = why ? boundReason(why) : undefined
    publish()
  }

  /** Schedules one evaluation; a later call replaces it. */
  function kick(delay: number) {
    clearTimeout(timer)
    timer = setTimeout(evaluate, delay)
    timer.unref()
  }

  /** Cancels the owned run once (the lane keeps it until cleanup); `why` is published as the waiting reason. */
  function cancelOwned(why?: string) {
    if (!owned || owned.cancelled) return
    owned.cancelled = true
    try {
      options.tests.cancel(owned.run.operation.id)
    }
    catch {}
    if (why) setPhase('waiting', why)
  }

  /** Establishes dependency evidence once per enablement, without blocking edits from being recorded. */
  function analyze() {
    analyzing = true
    setPhase('waiting', 'Analyzing story dependencies')
    const owner = session
    void options.selector.refresh().catch(() => false).then(() => {
      analyzing = false
      if (owner === session) analyzed = true
      if (enabled && !dead) kick(0)
    })
  }

  /** Reacts to a refused admission without losing the claimed set (already restored). */
  function refuse(refusal: ReturnType<typeof classifyRefusal>) {
    if (refusal.kind === 'pause') {
      pause = { kind: 'run', reason: refusal.reason }
      return setPhase('paused', refusal.reason)
    }
    setPhase('waiting', refusal.reason)
    // Queue-full has no lane notification: bounded exponential backoff, reset by any edit. A catalog still collecting is re-kicked by its own completion event.
    if (refusal.kind === 'queue-full') kick(Math.min(retry.max, retry.initial * 2 ** attempt++))
  }

  /** Claims the pending set, picks what to run, and admits it synchronously. */
  function admit() {
    const snapshot = options.catalog!.current!
    const claim = pending.claim()
    const selection = options.selector.select(scope, claim.changes)
    if (selection.status !== 'ok') {
      pending.restore(claim)
      if (selection.status === 'unavailable') return setPhase('waiting', 'Waiting for stories to finish collecting')
      // The scope vanished: stay put, never fall back to another scope.
      pause = { kind: 'target', reason: 'Selected story or variant is no longer in the catalog' }
      return setPhase('paused', pause.reason)
    }
    const plan = planAdmission(scope, selection, claim, snapshot)
    if (plan.kind === 'none') return setPhase('idle')
    let admitted: ReturnType<TestsService['run']>
    try {
      admitted = plan.kind === 'scope' ? options.tests.run(scope) : options.tests.runAffected(plan.storyIds)
    }
    catch (error) {
      pending.restore(claim)
      return refuse(classifyRefusal(error))
    }
    attempt = 0
    const entry: OwnedRun = { run: admitted, session, storyIds: plan.kind === 'affected' ? plan.storyIds : [], cancelled: false }
    owned = entry
    runs++
    operationId = admitted.operation.id
    setPhase('running')
    void admitted.settled.then(final => settle(entry, final))
  }

  /** The lane confirmed cleanup (or the run ended): decide what is still owed. */
  function settle(entry: OwnedRun, final: TestOperationDto) {
    if (owned === entry) owned = undefined
    operationId = undefined
    if (dead) return
    // A run of an earlier enablement owes nothing to the current one, but the current one may have been waiting for the lane.
    if (!enabled || entry.session !== session) {
      if (enabled) kick(0)
      // Watch is off: drop the finished run's ID from the published state.
      else publish()
      return
    }
    // Cancelled by someone else (the Tests screen): honour it until the next edit instead of re-admitting.
    const decision = final.state === 'cancelled' && !entry.cancelled ? { carry: true, pause: 'Run cancelled' } : judgeSettled(final)
    if (decision.carry) {
      // An interrupted batch publishes no summary, so even its finished stories are owed again.
      if (entry.storyIds.length) pending.carry(entry.storyIds)
      else pending.carryWhole()
    }
    if (decision.pause) pause = { kind: 'run', reason: decision.pause }
    publish()
    kick(0)
  }

  /** Decides the next step from the current barriers; runs on a timer, never inside a collection handler. */
  function evaluate() {
    timer = undefined
    if (!enabled || dead || owned || analyzing) return
    if (pause) return setPhase('paused', pause.reason)
    if (!barrier.attached()) return setPhase('paused', 'Story catalog is unavailable')
    if (barrier.failed()) return setPhase('paused', `Collection failed: ${barrier.failure()}`)
    if (!barrier.usable()) return setPhase('waiting', 'Waiting for stories to finish collecting')
    const quiet = quietUntil - Date.now()
    if (quiet > 0) {
      setPhase('waiting', 'Waiting for edits to settle')
      return kick(quiet)
    }
    if (!analyzed) return analyze()
    if (pending.empty) return setPhase('idle')
    admit()
  }

  /** One classified edit from the affected selector. */
  function onChange(change: AffectedChange) {
    if (!enabled || dead) return
    const selection = options.selector.select(scope, [change])
    // Known to affect nothing in this scope; a whole change may still add stories the catalog lacks yet.
    if (selection.status === 'ok' && !selection.storyIds.length && !change.whole) return
    pending.add(change)
    attempt = 0
    quietUntil = Date.now() + settleMs
    // An edit is the meaningful recovery for a vanished target or a failed run.
    pause = undefined
    cancelOwned('Source changed, waiting for the stale run to clean up')
    publish()
    kick(settleMs)
  }

  /** Collection progress; only records and schedules, so the collector is never held up. */
  function onCollection(event: Parameters<CollectionBarrierOptions['changed']>[0]) {
    if (!enabled || dead || event.revalidate) return
    if (event.phase === 'failed') cancelOwned('Collection failed, waiting for the stale run to clean up')
    if (event.phase !== 'started') kick(0)
  }

  barrier = createCollectionBarrier({ catalog: options.catalog, onCollection: options.onCollection, changed: onCollection })
  const offChange = options.selector.onChange(onChange)
  options.signal.addEventListener('abort', () => {
    dead = true
    clearTimeout(timer)
    offChange()
    barrier.dispose()
  }, { once: true })

  return {
    /**
     * Enables, retargets or disables watching. An unchanged request is a no-op;
     * a new scope cancels owned work, resets the pending set and runs the new scope once.
     * @param args Desired state.
     */
    set(args: WatchSetArgs): WatchStateDto {
      if (dead) return state()
      if (!args.enabled) {
        // Disabled first: the cancellation below can never be followed by a successor.
        session++
        enabled = false
        pending.clear()
        pause = undefined
        clearTimeout(timer)
        // No file observation or graph rebuilding while watch is off.
        options.selector.detach()
        attempt = 0
        cancelOwned()
        setPhase('off')
        return state()
      }
      if (enabled && JSON.stringify(args.scope) === JSON.stringify(scope)) return state()
      session++
      enabled = true
      options.selector.attach()
      scope = args.scope!
      runs = 0
      attempt = 0
      quietUntil = 0
      analyzed = false
      pause = undefined
      pending.clear()
      pending.carryWhole()
      cancelOwned('Scope changed, waiting for the previous run to clean up')
      // A cleanup already pending from a disabled watch still gates the first run of this one.
      setPhase('waiting', owned ? 'Waiting for the previous run to clean up' : 'Waiting for stories to finish collecting')
      kick(0)
      return state()
    },
    /** Current snapshot. */
    state,
  }
}

/** Per-generation scheduler. */
export type WatchScheduler = ReturnType<typeof createWatchScheduler>
