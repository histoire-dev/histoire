import type { HistoireSession } from '@histoire/sdk/internal'
import type { LoadedProps, WorkbenchSearchResult } from './query.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { matchLoadedProps, projectSearchResults, readPropNames } from './query.js'

/** Local search request publication; metadata and source never cross provider lifetimes. */
export interface WorkbenchSearchState {
  /** Query whose results are safe to activate. */
  query: string
  /** Debounced source search is in flight. */
  loading: boolean
  /** Ranked source results followed by runtime prop names. */
  results: readonly WorkbenchSearchResult[]
  /** Non-blocking transport/index notice. */
  error: unknown
}

/** Keep source Fuse ranking and generation guards in one standalone request owner. */
export function createWorkbenchSearchController(session: HistoireSession, publish: (state: WorkbenchSearchState) => void) {
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
    if (active) publish({ query, loading, error, results: [...ranked, ...matchLoadedProps([...loaded.values()], session.getSnapshot().catalog.stories, query)] })
  }
  /** Only ready canonical state may add runtime-owned prop metadata. */
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
    if (snapshot.status === 'ready' && !snapshot.stale && snapshot.runtime.status === 'ready' && snapshot.state && snapshot.state.runtimeId === snapshot.runtime.runtimeId) {
      loaded.set(getHistoireTargetKey(snapshot.state.target), { target: snapshot.state.target, names: readPropNames(snapshot.state.value) })
    }
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
      loaded.clear()
      cache.clear()
    },
  }
}
