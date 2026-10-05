import type { HistoireSourceIdentity, HistoireTarget, HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import { HistoireSdkError } from '@histoire/protocol'

/** Local test panel data never changes canonical session or executes during mount. */
export interface HistoireTestsState {
  /** Explicit request lifecycle. */
  status: 'idle' | 'collecting' | 'running' | 'cancelled' | 'completed' | 'failed'
  /** Existing wire definitions. */
  collection: HistoireTestCollectionResult | null
  /** Assertions complete even when summary.ok is false. */
  summary: HistoireTestRunSummary | null
  /** Capability/transport/initialization failure. */
  error: unknown
  /** Captured initiating target; reset states never acquire replacement selection. */
  target?: HistoireTarget | null
  /** Captured source keeps host projections attributable across replacement publications. */
  source?: HistoireSourceIdentity | null
}

/** Panel owns operation cancellation and observer only; provider never owns caller's session. */
export function createHistoireTestsController(session: HistoireSession, publish: (state: HistoireTestsState) => void) {
  let state: HistoireTestsState = { status: 'idle', collection: null, summary: null, error: null }
  let active = true
  let generation = 0
  let abort: AbortController | undefined
  /** Capture exact selection/source/document without parsing concatenated IDs. */
  function identity() {
    const value = session.getSnapshot()
    return JSON.stringify([value.status, value.stale, value.source?.sourceId, value.source?.epoch, value.source?.revision, value.selection, value.runtime.status, value.runtime.runtimeId])
  }
  let owner = identity()
  /** Publish only current operation; late cancelled completions stay observed. */
  function update(patch: Partial<HistoireTestsState>) {
    state = { ...state, ...patch }
    if (active) publish(state)
  }
  /** Cancel publication immediately; engine retains actual teardown ownership. */
  function cancel() {
    generation++
    const previous = abort
    abort = undefined
    // Aborting preview execution may synchronously retire its document. Publish
    // first so that retirement's idle reset cannot be overwritten on return.
    update({ status: 'cancelled', summary: null })
    previous?.abort(new HistoireSdkError('CANCELLED', 'Test panel cancelled'))
  }
  const unsubscribe = session.subscribe(() => {
    const current = identity()
    if (owner === current) return
    owner = current
    cancel()
    update({ status: 'idle', collection: null, summary: null, error: null, target: null, source: null })
  })
  /** One explicit panel operation; no automatic preview-to-server retry. */
  async function perform(mode?: 'preview' | 'server') {
    if (!active) throw new HistoireSdkError('DISPOSED', 'Tests panel closed')
    if (abort) throw new HistoireSdkError('RUNTIME_IN_USE', 'Tests panel already running')
    const current = ++generation
    abort = new AbortController()
    const snapshot = session.getSnapshot()
    update({ status: mode ? 'running' : 'collecting', error: null, summary: null, target: snapshot.selection, source: snapshot.source })
    try {
      const result = mode ? await session.tests.run({ mode, signal: abort.signal }) : await session.tests.collect()
      if (active && current === generation) update(mode ? { summary: result as HistoireTestRunSummary, status: 'completed' } : { collection: result as HistoireTestCollectionResult, status: 'idle' })
      return result
    }
    catch (error) {
      if (active && current === generation) update({ error, status: (error as { code?: string }).code === 'CANCELLED' ? 'cancelled' : 'failed' })
      throw error
    }
    finally { if (current === generation) abort = undefined }
  }
  return {
    /** Explicit collection requires ready preview. */
    collect: () => perform(),
    /** Explicit engine selected by caller. */
    run: (mode: 'preview' | 'server') => perform(mode),
    cancel,
    /** Stops only panel observations and operations. */
    close() {
      if (!active) return
      cancel()
      active = false
      unsubscribe()
    },
  }
}
