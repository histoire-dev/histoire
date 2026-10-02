import type { ProjectRuntimeDependencies, ProjectRuntimeHandle, ProjectRuntimeOptions, ProjectRuntimeStatus, RuntimeGeneration } from './types.js'
import { randomUUID } from 'node:crypto'
import { hasUnconfirmedCleanup, withCleanupDeadline } from './cleanup.js'
import { watchProjectConfiguration } from './config-watchers.js'
import { startProjectRuntime } from './start.js'
import { waitForRuntimeWork } from './wait.js'

/** Module-global stories state supports one live project owner per process. */
let processOwner: object | undefined

/** Serializes startup/restart and suppresses feedback from superseded generations. */
export function createProjectRuntimeController(options: ProjectRuntimeOptions = {}, dependencies: Partial<ProjectRuntimeDependencies> = {}) {
  const owner = {}
  const acquire = dependencies.start ?? startProjectRuntime
  const watch = dependencies.watch ?? watchProjectConfiguration
  const listeners = new Set<(status: ProjectRuntimeStatus, handle?: ProjectRuntimeHandle) => void>()
  let status: ProjectRuntimeStatus = 'starting'
  let current: ProjectRuntimeHandle | undefined
  let generation: RuntimeGeneration | undefined
  let disposeWatch: (() => Promise<void>) | undefined
  let abort: AbortController | undefined
  let transition: Promise<ProjectRuntimeHandle> | undefined
  let closing: Promise<void> | undefined
  let pendingRestart = false
  let unsafeCleanupError: unknown
  let version = 0

  /** Announces lifecycle changes after state has been updated. */
  function publish(next: ProjectRuntimeStatus) {
    status = next
    for (const listener of listeners) listener(status, current)
  }

  /** Invalidates ownership before closing watchers and server resources. */
  async function release() {
    version++
    abort?.abort(new Error('Project runtime closed'))
    const oldHandle = current
    current = undefined
    const oldGeneration = generation
    const oldWatch = disposeWatch
    generation = undefined
    disposeWatch = undefined
    try {
      if (oldHandle) await options.onBeforeRelease?.(oldHandle)
    }
    catch (error) {
      unsafeCleanupError = error
      // Preserve process ownership after unknown runner teardown; closing
      // remaining project resources still avoids watcher/server leaks.
      await Promise.allSettled([oldWatch?.(), oldGeneration?.close()])
      throw error
    }
    const results = await Promise.allSettled([oldWatch?.(), oldGeneration?.close()])
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) {
      unsafeCleanupError = failure.reason
      throw failure.reason
    }
  }

  /** Creates a fresh generation; late acquisition is closed before returning. */
  async function initialize(): Promise<ProjectRuntimeHandle> {
    if (processOwner && processOwner !== owner) throw new Error('A project runtime already owns this process')
    processOwner = owner
    const capturedVersion = ++version
    const active = () => status !== 'closed' && capturedVersion === version
    const localAbort = new AbortController()
    abort = localAbort
    let runtime: RuntimeGeneration | undefined
    try {
      runtime = await acquire(options, localAbort.signal, active)
      if (!active()) {
        try {
          await runtime.close()
        }
        catch (error) {
          unsafeCleanupError = error
          throw error
        }
        throw new Error('Project runtime closed')
      }
      generation = runtime
      const handle: ProjectRuntimeHandle = {
        ...runtime,
        epoch: randomUUID(),
        isActive: active,
        get collectionOutcomes() { return runtime.collectionOutcomes },
      }
      current = handle
      await options.onGeneration?.(handle)
      if (!active()) throw new Error('Project runtime closed')
      const stopWatch = await watch(runtime, options, (source) => {
        void restart(source).catch(error => options.onError?.(error))
      })
      if (!active()) {
        try {
          await stopWatch()
        }
        catch (error) {
          unsafeCleanupError = error
          throw error
        }
        throw new Error('Project runtime closed')
      }
      disposeWatch = stopWatch
      // Abort wins even if project execution never settles its readiness work.
      await waitForRuntimeWork(runtime.ready, localAbort.signal)
      if (!active()) throw new Error('Project runtime closed')
      publish('ready')
      return handle
    }
    catch (error) {
      if (hasUnconfirmedCleanup(error)) unsafeCleanupError = error
      if (active()) {
        let cleanupError: unknown
        try {
          await release()
        }
        catch (failure) {
          cleanupError = failure
        }
        finally {
          publish('failed')
        }
        if (!cleanupError && !unsafeCleanupError && processOwner === owner) processOwner = undefined
        if (cleanupError) throw new AggregateError([error, cleanupError], String(error))
      }
      throw error
    }
  }

  /** Repeats once when a config edit lands after the next config was acquired. */
  async function finishTransitions(first: Promise<ProjectRuntimeHandle>) {
    let handle = await first
    while (pendingRestart && status !== 'closed') {
      pendingRestart = false
      const released = release()
      publish('restarting')
      await released
      handle = await initialize()
    }
    return handle
  }

  /** Records teardown failures as terminal lifecycle failures, including restarts. */
  function observeTransition(work: Promise<ProjectRuntimeHandle>) {
    return work.catch((error) => {
      if (status !== 'closed' && status !== 'failed') publish('failed')
      throw error
    }).finally(() => {
      transition = undefined
    })
  }

  /** Starts once, or joins an in-progress generation transition. */
  function start() {
    if (status === 'closed') return Promise.reject(new Error('Project runtime closed'))
    if (unsafeCleanupError) return Promise.reject(unsafeCleanupError)
    if (current && status === 'ready') return Promise.resolve(current)
    if (transition) return transition
    publish('starting')
    transition = observeTransition(finishTransitions(initialize()))
    return transition
  }

  /** Coalesces edits received during one teardown/startup into one restart. */
  function restart(_source?: string) {
    if (status === 'closed') return Promise.reject(new Error('Project runtime closed'))
    if (unsafeCleanupError) return Promise.reject(unsafeCleanupError)
    if (transition) {
      // Edits before a next generation is acquired already use its fresh config.
      // Edits after acquisition must restart again to avoid losing a config edit.
      if (current) pendingRestart = true
      return transition
    }
    const released = release()
    publish('restarting')
    transition = observeTransition(finishTransitions((async () => {
      await released
      return initialize()
    })()))
    return transition
  }

  return {
    /** Current lifecycle state, usable before a catalog exists. */
    get status() { return status },
    /** Current private handle; undefined during teardown or after failure. */
    get current() { return current },
    start,
    restart,
    /** Joins the next completed ready generation. */
    waitForReady: start,
    /** Registers lifecycle observations; caller owns returned disposer. */
    subscribe(listener: (status: ProjectRuntimeStatus, handle?: ProjectRuntimeHandle) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Stops admission immediately and releases acquired resources once. */
    close() {
      if (!closing) {
        publish('closed')
        const released = release()
        // Acquisition may ignore its signal. Keep process ownership until it
        // returns and its late-created resources are confirmed closed.
        closing = withCleanupDeadline(Promise.all([released, transition?.catch(() => {})])).then(() => {
          if (unsafeCleanupError) throw unsafeCleanupError
          if (processOwner === owner) processOwner = undefined
        }).finally(() => {
          listeners.clear()
        })
      }
      return closing
    },
  }
}
