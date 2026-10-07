import type { InjectionKey, WatchSource } from 'vue'
import { inject, onBeforeUnmount, provide, watch } from 'vue'

/** One admitted frame's cancellable initial acquisition. */
export interface CanvasStartupRequest {
  /** Resolves after readiness, cancellation, or owned teardown following failure. */
  completion: Promise<void>
  /** Cancel queued work or abort active work; active capacity releases after cleanup. */
  cancel: () => void
}

/** Canvas-local gate for bounded, selected-first Grid/List startup. */
export interface CanvasStartupCoordinator {
  /** Update selected-first or fallback-anchor order without changing live admission. */
  setOrder: (frameIds: readonly string[]) => void
  /** Queue one frame acquisition; completion follows readiness and retained-state restoration. */
  request: (frameId: string, start: (signal: AbortSignal) => Promise<void>) => CanvasStartupRequest
  /** Abort all work when its owning canvas provider unmounts. */
  dispose: () => void
}

type JobPhase = 'queued' | 'active' | 'complete' | 'cancelled'
type FrameStartupState = 'pending' | 'ready' | 'failed' | 'cancelled'

interface StartupJob {
  /** Stable admitted frame identity. */
  id: string
  /** Unique activation token fencing retries and late completions. */
  sequence: number
  /** Startup callback, released when queued work retires or active work settles. */
  start?: (signal: AbortSignal) => Promise<void>
  /** Abort source for this activation. */
  controller: AbortController
  /** Current lifecycle phase. */
  phase: JobPhase
  /** Resolve after readiness or owned cancellation cleanup. */
  resolve: () => void
  /** Reject after failure cleanup. */
  reject: (error: unknown) => void
}

interface FrameStateRecord {
  /** Monotonic activation identity; never retains component callbacks. */
  sequence: number
  /** Barrier state for the current or most recent activation. */
  state: FrameStartupState
}

/** Create one bounded coordinator for a single mounted canvas. */
export function createCanvasStartupCoordinator(limit = 2): CanvasStartupCoordinator {
  const capacity = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 1))
  const queued: StartupJob[] = []
  const jobs = new Set<StartupJob>()
  const currentByFrame = new Map<string, StartupJob>()
  const stateByFrame = new Map<string, FrameStateRecord>()
  const activeByFrame = new Map<string, number>()
  let activeCount = 0
  let sequence = 0
  let order: string[] = []
  let drainScheduled = false
  let disposed = false

  /** Schedule one microtask so same-patch frame requests share latest order. */
  function scheduleDrain(): void {
    if (disposed || drainScheduled) return
    drainScheduled = true
    queueMicrotask(drain)
  }

  /** Retire only this activation's scalar state and callback ownership. */
  function cancel(job: StartupJob): void {
    if (job.phase === 'cancelled') return
    const wasComplete = job.phase === 'complete'
    const isCurrent = currentByFrame.get(job.id) === job
    const wasQueued = job.phase === 'queued'
    job.controller.abort()
    if (wasQueued) {
      const index = queued.indexOf(job)
      if (index >= 0) queued.splice(index, 1)
      jobs.delete(job)
      job.phase = 'cancelled'
      job.start = undefined
      job.resolve()
    }
    else if (job.phase === 'complete') {
      job.phase = 'cancelled'
    }
    else {
      // Keep active ownership until start() observes abort and finishes teardown.
      job.phase = 'cancelled'
    }
    if (isCurrent) {
      currentByFrame.delete(job.id)
      if (order.includes(job.id)) stateByFrame.set(job.id, { sequence: job.sequence, state: 'cancelled' })
      else if (!activeByFrame.has(job.id) && stateByFrame.get(job.id)?.sequence === job.sequence) stateByFrame.delete(job.id)
    }
    else if (wasComplete && stateByFrame.get(job.id)?.sequence === job.sequence) {
      stateByFrame.delete(job.id)
    }
    scheduleDrain()
  }

  /** Settle one activation after startup callback has completed owned cleanup. */
  function finish(job: StartupJob, failed: boolean, error?: unknown): void {
    const wasCancelled = job.controller.signal.aborted
    job.phase = 'complete'
    job.start = undefined
    jobs.delete(job)
    activeCount--
    const remaining = (activeByFrame.get(job.id) ?? 1) - 1
    if (remaining > 0) activeByFrame.set(job.id, remaining)
    else activeByFrame.delete(job.id)

    // Old completions cannot publish over a replacement activation with same frame ID.
    const current = currentByFrame.get(job.id) === job
    const record = stateByFrame.get(job.id)
    if (!disposed && current && record?.sequence === job.sequence) {
      stateByFrame.set(job.id, { sequence: job.sequence, state: wasCancelled ? 'cancelled' : failed ? 'failed' : 'ready' })
      currentByFrame.delete(job.id)
    }
    if (!order.includes(job.id) && stateByFrame.get(job.id)?.sequence === job.sequence) stateByFrame.delete(job.id)
    if (wasCancelled) job.resolve()
    else if (failed) job.reject(error)
    else job.resolve()
    scheduleDrain()
  }

  /** Start one job after accounting for its slot, including reentrant requests. */
  function start(job: StartupJob): void {
    if (disposed || job.phase !== 'queued' || activeByFrame.has(job.id)) return
    const index = queued.indexOf(job)
    if (index >= 0) queued.splice(index, 1)
    job.phase = 'active'
    activeCount++
    activeByFrame.set(job.id, (activeByFrame.get(job.id) ?? 0) + 1)
    jobs.add(job)
    // Cancellation can occur after reservation but before this microtask runs.
    void Promise.resolve().then(() => {
      job.controller.signal.throwIfAborted()
      return job.start?.(job.controller.signal)
    }).then(
      () => finish(job, false),
      error => finish(job, true, error),
    )
  }

  /** Drain by current order, keeping every sibling behind pending anchor. */
  function drain(): void {
    drainScheduled = false
    if (disposed) return

    const anchorId = order[0]
    const anchor = anchorId ? stateByFrame.get(anchorId) : undefined
    if (anchorId && (!anchor || anchor.state === 'pending')) {
      const anchorJob = currentByFrame.get(anchorId)
      if (anchorJob?.phase === 'queued' && activeCount < capacity && !activeByFrame.has(anchorId)) start(anchorJob)
      return
    }

    const rank = new Map(order.map((id, index) => [id, index] as const))
    while (activeCount < capacity) {
      const next = queued
        .filter(job => job.phase === 'queued' && currentByFrame.get(job.id) === job && rank.has(job.id) && !activeByFrame.has(job.id))
        .sort((first, second) => rank.get(first.id)! - rank.get(second.id)! || first.sequence - second.sequence)[0]
      if (!next) return
      start(next)
    }
  }

  return {
    setOrder(frameIds) {
      const next = [...new Set(frameIds)]
      if (next.length === order.length && next.every((id, index) => id === order[index])) return
      order = next
      // Completed frames that left live admission need no readiness record.
      for (const id of stateByFrame.keys()) {
        if (!order.includes(id) && !currentByFrame.has(id) && !activeByFrame.has(id)) stateByFrame.delete(id)
      }
      scheduleDrain()
    },
    request(frameId, startTask) {
      if (disposed) return { completion: Promise.resolve(), cancel() {} }
      const previous = currentByFrame.get(frameId)
      if (previous) cancel(previous)
      const id = sequence++
      let resolve!: () => void
      let reject!: (error: unknown) => void
      const completion = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      // Callers may not await component-unmount cancellation, so failure remains observed.
      void completion.catch(() => {})
      const job: StartupJob = { id: frameId, sequence: id, start: startTask, controller: new AbortController(), phase: 'queued', resolve, reject }
      currentByFrame.set(frameId, job)
      stateByFrame.set(frameId, { sequence: id, state: 'pending' })
      queued.push(job)
      jobs.add(job)
      scheduleDrain()
      return { completion, cancel: () => cancel(job) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const job of [...jobs]) cancel(job)
      queued.length = 0
      currentByFrame.clear()
      stateByFrame.clear()
    },
  }
}

const canvasStartupCoordinatorKey: InjectionKey<CanvasStartupCoordinator> = Symbol('histoire-canvas-startup-coordinator')

/** Provide and own startup coordination for one CanvasViewport. */
export function provideCanvasStartupCoordinator(order: WatchSource<readonly string[]>): CanvasStartupCoordinator {
  const coordinator = createCanvasStartupCoordinator()
  provide(canvasStartupCoordinatorKey, coordinator)
  watch(order, value => coordinator.setOrder(value), { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => coordinator.dispose())
  return coordinator
}

/** Read nearest canvas coordinator; Matrix and standalone views may omit it. */
export function useCanvasStartupCoordinator(): CanvasStartupCoordinator | undefined {
  return inject(canvasStartupCoordinatorKey, undefined)
}
