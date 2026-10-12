import type { HistoireSession } from '@histoire/sdk/internal'
import type { Ref } from 'vue'
import type { LoadedProps, WorkbenchSearchResult } from './query.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { watch } from 'vue'
import { rankSearchMatches } from '../../../../embed/search-match.js'
import { matchLoadedProps, projectSearchResults, readPropNames } from './query.js'

/** Local search request publication; metadata and source never cross provider lifetimes. */
export interface WorkbenchSearchState {
  /** Query whose results are safe to activate. */
  query: string
  /** Debounced source search is in flight. */
  loading: boolean
  /** Source results and runtime prop names share one relevance order. */
  results: readonly WorkbenchSearchResult[]
  /** Non-blocking transport/index notice. */
  error: unknown
}

/** Snapshot of the session currently owning the selected runtime document. */
export interface WorkbenchSearchRuntime {
  /** Canonical snapshot, or the admitted canvas frame snapshot once bound. */
  snapshot: Readonly<Ref<ReturnType<HistoireSession['getSnapshot']>>>
}

/**
 * Merge shared relevance while retaining generation guards in one request owner.
 * @param session Canonical session owning source search and catalog.
 * @param publish Receives every published search state.
 * @param runtime Optional runtime binding; canvas frames own selected runtime state, not the canonical session.
 */
export function createWorkbenchSearchController(session: HistoireSession, publish: (state: WorkbenchSearchState) => void, runtime?: WorkbenchSearchRuntime) {
  let active = true
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let query = ''
  let source = sourceKey(session.getSnapshot())
  let ranked: WorkbenchSearchResult[] = []
  let error: unknown = null
  let loading = false
  const loaded = new Map<string, LoadedProps>()
  const cache = new Map<string, WorkbenchSearchResult[]>()
  /** Clear memory when the canonical source publication changes. */
  function sourceKey(snapshot: ReturnType<HistoireSession['getSnapshot']>): string {
    return JSON.stringify([snapshot.source?.sourceId, snapshot.source?.epoch, snapshot.source?.revision])
  }
  /** Publish current query only; prop updates do not request another source index. */
  function update() {
    // Keep source candidates intact: later runtime definitions can suppress
    // fallback, and removing those definitions must reveal it without refetching.
    if (active) publish({ query, loading, error, results: rankSearchMatches([...ranked, ...matchLoadedProps([...loaded.values()], session.getSnapshot().catalog.stories, query)]) })
  }
  /** Only ready runtime-owned state may add prop metadata. */
  function collect(snapshot: ReturnType<HistoireSession['getSnapshot']>) {
    if (sourceKey(snapshot) === source && snapshot.status === 'ready' && !snapshot.stale && snapshot.runtime.status === 'ready' && snapshot.state && snapshot.state.runtimeId === snapshot.runtime.runtimeId) {
      loaded.set(getHistoireTargetKey(snapshot.state.target), { target: snapshot.state.target, names: readPropNames(snapshot.state.value) })
    }
  }
  /** Canonical publications own source invalidation; standalone canonical has no runtime once frames own it. */
  function observe(snapshot: ReturnType<HistoireSession['getSnapshot']>) {
    const key = sourceKey(snapshot)
    if (key !== source) {
      source = key
      generation++
      loaded.clear()
      cache.clear()
      ranked = []
      schedule()
    }
    collect(snapshot)
    update()
  }
  /** Superseded requests remain observed but cannot publish or restore old targets. */
  async function run() {
    const token = ++generation
    const ownedQuery = query
    const ownedSource = source
    if (!query.trim() || query.startsWith('>')) {
      loading = false
      ranked = []
      error = null
      update()
      return
    }
    loading = true
    error = null
    update()
    try {
      const results = await session.catalog.search(ownedQuery)
      if (!active || token !== generation || ownedSource !== source) return
      ranked = projectSearchResults(results, session.getSnapshot().catalog.stories)
      cache.set(ownedQuery, ranked)
      if (cache.size > 20) cache.delete(cache.keys().next().value!)
    }
    catch (cause) {
      if (!active || token !== generation || ownedSource !== source) return
      // A repeat query can keep its known title results when a content request fails.
      ranked = cache.get(ownedQuery)?.filter(result => result.kind !== 'docs') ?? []
      error = cause
    }
    finally {
      if (active && token === generation && ownedSource === source) {
        loading = false
        update()
      }
    }
  }
  /** Debounce query changes while retiring previous keyboard activation immediately. */
  function schedule() {
    clearTimeout(timer)
    generation++
    ranked = []
    loading = Boolean(query.trim() && !query.startsWith('>'))
    error = null
    update()
    timer = setTimeout(() => void run(), 50)
  }
  const off = session.subscribe(observe)
  observe(session.getSnapshot())
  // Bound frame sessions publish selected runtime state the canonical session never receives.
  const stopRuntime = runtime
    ? watch(runtime.snapshot, (snapshot) => {
        collect(snapshot)
        update()
      }, { immediate: true, flush: 'sync' })
    : () => {}
  return {
    /** Set raw query; source search receives the same text as the existing modal. */
    search(value: string) {
      query = value
      schedule()
    },
    /** Child/provider cleanup never disposes caller's session. */
    close() {
      active = false
      generation++
      clearTimeout(timer)
      off()
      stopRuntime()
      loaded.clear()
      cache.clear()
    },
  }
}
