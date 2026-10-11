import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { WorkbenchTestCollectionOptions, WorkbenchTestEntry, WorkbenchTestsOptions } from './types.js'
import { getHistoireTargetKey, HistoireSdkError, validateProjectTestCollection } from '@histoire/protocol'
import { shallowRef } from 'vue'

/** Model-owned evidence and execution remain independent from discovery scheduling. */
interface DiscoveryOwner {
  /** Current immutable source publication. */
  snapshot: () => ReturnType<HistoireSession['getSnapshot']>
  /** Copy-on-write entries provide per-target evidence versions. */
  entries: () => ReadonlyMap<string, WorkbenchTestEntry>
  /** Exact executable invalidation epoch for one story. */
  epoch: (storyId: string) => number
  /** Assertion work preempts background definition discovery. */
  running: () => boolean
  /** Publish one coherent set of eligible collection facts. */
  apply: (variants: HistoireProjectTestCollectionResult['variants']) => void
}

/** Source tuple keeps stale background completion from gaining publication authority. */
function sourceKey(snapshot: ReturnType<HistoireSession['getSnapshot']>): string {
  return JSON.stringify([snapshot.source?.sourceId, snapshot.source?.epoch, snapshot.source?.revision])
}

/** Discover definitions once on connection and coalesce affected stories without running tests. */
export function createWorkbenchTestDiscovery(options: WorkbenchTestsOptions, owner: DiscoveryOwner) {
  const status = shallowRef<'idle' | 'collecting' | 'completed' | 'error'>('idle')
  const error = shallowRef<unknown>(null)
  const progress = shallowRef({ completed: 0, total: 0 })
  const pending = new Set<string>()
  let project = !!options.collectProject
  let force = false
  let active = true
  let suspended = 0
  let blocked = false
  let identity: string | undefined
  let publication: string | undefined
  let request: { abort: AbortController, storyId?: string, force: boolean } | undefined

  /** Microtask admission coalesces HMR and lets explicit execution win first. */
  function schedule() {
    queueMicrotask(() => {
      void drain()
    })
  }
  /** Aborted promises may settle late; only current request can publish or reschedule. */
  function cancel(preserve = false) {
    const previous = request
    request = undefined
    previous?.abort.abort()
    if (preserve && previous) {
      force ||= previous.force
      if (previous.storyId) pending.add(previous.storyId)
      else project = !!options.collectProject
    }
    if (status.value === 'collecting') status.value = 'idle'
  }
  /** Source changes retire requests; metadata-only publications retain collected evidence. */
  function refresh() {
    if (!active) return
    const snapshot = owner.snapshot()
    const nextIdentity = JSON.stringify([snapshot.source?.sourceId, snapshot.source?.epoch])
    const nextPublication = snapshot.source?.revision
    if (identity !== nextIdentity) {
      cancel()
      pending.clear()
      project = !!options.collectProject
      force = false
      blocked = false
      error.value = null
      status.value = 'idle'
      identity = nextIdentity
    }
    else if (publication !== nextPublication) {
      cancel(true)
      // Admission can reject while catalog updating, before its replacement
      // publication arrives. That failure cannot block the newer source.
      blocked = false
      error.value = null
      if (status.value === 'error') status.value = 'idle'
    }
    publication = nextPublication
    if (snapshot.status !== 'ready' || snapshot.stale) cancel(true)
    else schedule()
  }
  /** Changed hidden variants must be discovered even with Watch disabled. */
  function invalidate(storyId: string) {
    if (!active || (!options.collectProject && !options.collectStory)) return
    // Dependency HMR can retire a graph without changing catalog revision.
    // Revoke the request before its rejection can block newer queued work.
    cancel(true)
    pending.add(storyId)
    blocked = false
    schedule()
  }
  /** One request collects all variants; exact target/evidence checks protect concurrent preview facts. */
  async function drain() {
    const snapshot = owner.snapshot()
    if (!active || suspended || request || blocked || owner.running() || snapshot.status !== 'ready' || snapshot.stale || snapshot.source?.mode !== 'dev') return
    if (!project && !pending.size) return
    const storyId = !project && options.collectStory ? pending.values().next().value : undefined
    const collect = storyId ? (signal: AbortSignal, publish?: (result: HistoireProjectTestCollectionResult) => void, collectionOptions?: WorkbenchTestCollectionOptions) => options.collectStory!(storyId, signal, publish, collectionOptions) : options.collectProject
    if (!collect) return
    if (storyId) {
      pending.delete(storyId)
    }
    else {
      project = false
      pending.clear()
    }
    const targets = snapshot.catalog.stories.filter(story => !story.docsOnly && (!storyId || story.id === storyId)).flatMap(story => story.variants.map(variant => ({ storyId: story.id, variantId: variant.id })))
    const evidence = new Map(targets.map(target => [getHistoireTargetKey(target), owner.entries().get(getHistoireTargetKey(target))]))
    const epochs = new Map(targets.map(target => [target.storyId, owner.epoch(target.storyId)]))
    const source = sourceKey(snapshot)
    const current = { abort: new AbortController(), storyId, force }
    force = false
    request = current
    status.value = 'collecting'
    error.value = null
    progress.value = { completed: 0, total: targets.length }
    const admitted = new Set(targets.map(getHistoireTargetKey))
    const completed = new Set<string>()
    let runId: string | undefined
    /** Partial publication advances our own evidence while preserving newer selected/execution facts. */
    function publish(result: HistoireProjectTestCollectionResult, terminal = false) {
      if (!active || request !== current || sourceKey(owner.snapshot()) !== source) return
      validateProjectTestCollection(result, terminal ? targets : undefined)
      const execution = result.execution
      if (execution.sourceId !== snapshot.source?.sourceId || execution.epoch !== snapshot.source?.epoch || execution.revision !== snapshot.source?.revision) throw new HistoireSdkError('STALE_REVISION', 'Test discovery belongs to another source publication')
      if (runId && execution.runId !== runId) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test discovery operation changed')
      runId = execution.runId
      for (const entry of result.variants) {
        const key = getHistoireTargetKey(entry.target)
        if (!admitted.has(key)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test discovery target inventory changed')
        completed.add(key)
      }
      const valid = result.variants.filter(entry => evidence.get(getHistoireTargetKey(entry.target)) === owner.entries().get(getHistoireTargetKey(entry.target)) && epochs.get(entry.target.storyId) === owner.epoch(entry.target.storyId))
      owner.apply(valid)
      for (const entry of valid) evidence.set(getHistoireTargetKey(entry.target), owner.entries().get(getHistoireTargetKey(entry.target)))
      progress.value = { completed: completed.size, total: targets.length }
    }
    try {
      const result = await collect(current.abort.signal, publish, current.force ? { force: true } : undefined)
      if (!active || request !== current || sourceKey(owner.snapshot()) !== source) return
      publish(result, true)
      status.value = 'completed'
    }
    catch (failure) {
      if (active && request === current && sourceKey(owner.snapshot()) === source) {
        error.value = failure
        status.value = 'error'
        blocked = true
        if (storyId) pending.add(storyId)
        else project = true
      }
    }
    finally {
      if (request === current) {
        request = undefined
        schedule()
      }
    }
  }
  return { status, error, progress, refresh, invalidate,
    /** Capture owners pause background work; confirmed runner cleanup still owns lane release. */
    suspend() {
      suspended++
      cancel(true)
      let released = false
      return () => {
        if (released) return
        released = true
        suspended--
        if (active && !suspended) schedule()
      }
    },
    /** Explicit Run all cancels background requests through same server lane. */
    preempt() {
      cancel()
      pending.clear()
      project = false
      force = false
      blocked = false
      error.value = null
    },
    /** Retry is explicit after dependency, transport, or collection failure. */
    retry() {
      cancel(true)
      blocked = false
      project = !!options.collectProject
      force = true
      schedule()
    },
    /** No late collection may publish after model teardown. */
    close() {
      active = false
      cancel()
      pending.clear()
    } }
}
