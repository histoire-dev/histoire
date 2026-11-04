import type { TestTarget } from '@histoire/cli/protocol/tests'
import type { Context } from '../../../context.js'
import type { RuntimeCatalog } from '../../catalog/publication.js'
import type { ProjectRuntimeHandle } from '../../types.js'
import type { EvidenceIndex } from './evidence-index.js'
import type { AffectedChange, AffectedSelection } from './types.js'
import { captureTestCollectionEligibility, captureTestCollectionGeneration } from '../../../test/eligibility/index.js'
import { classifyFileEvent } from './classify.js'
import { buildEvidenceIndex, EMPTY_INDEX } from './evidence-index.js'
import { findChangedLeaves, withLeafOwners } from './leaves.js'
import { selectAffected } from './select.js'
import { isAffecting } from './types.js'

/** Inputs of one per-generation selector. */
export interface AffectedSelectorOptions {
  /** Active generation: its context, watcher and collection observations. */
  handle: Pick<ProjectRuntimeHandle, 'context' | 'server' | 'onCollection' | 'isActive'>
  /** Canonical catalog of the generation; scope and removed IDs resolve against it. */
  catalog: RuntimeCatalog | undefined
  /** Aborted when the generation is released: detach everything. */
  signal: AbortSignal
  /** Quiet period after an outdating event before re-analysis (tests only). */
  settleMs?: number
}

/** Receives every change that selects something, in event order. */
export type AffectedListener = (change: AffectedChange) => void

/**
 * Computes affected-story membership for one runtime generation. It owns a
 * detached copy of the last complete dependency evidence, so the eligibility
 * service retiring or forgetting a graph (edit, deletion) never loses
 * ownership before the event is classified. It never schedules anything.
 * @param options Generation-scoped capabilities.
 */
export function createAffectedSelector(options: AffectedSelectorOptions) {
  const ctx: Context = options.handle.context
  const listeners = new Set<AffectedListener>()
  let index: EvidenceIndex = EMPTY_INDEX
  let seq = 0
  /** Stories whose retained graph an event outdated, with the event order. */
  const stale = new Map<string, number>()
  /** Order of the last structural event: every retained graph is outdated until a newer analysis. */
  let staleAll = 0
  let refreshing: Promise<boolean> | undefined
  let again = false
  let settle: ReturnType<typeof setTimeout> | undefined

  /** Notifies subscribers; one failing listener cannot hide a change from the rest. */
  function publish(change: AffectedChange) {
    if (!isAffecting(change)) return
    for (const listener of [...listeners]) {
      try {
        listener(change)
      }
      catch (error) { console.error(error) }
    }
  }

  /** One analysis pass over every collected story. */
  async function analyze(): Promise<boolean> {
    const started = seq
    const storyFiles = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly).map(file => ({ path: file.path, storyId: file.story!.id }))
    // Without the eligibility service no analysis exists; that is a failure, not an empty graph.
    if (!captureTestCollectionGeneration(ctx)) return false
    let evidence
    try {
      evidence = (await captureTestCollectionEligibility(ctx, undefined, options.signal)).evidence
    }
    catch {
      // Retired graph, cancellation or analysis failure: the old complete evidence stays in force.
      return false
    }
    if (options.signal.aborted || !options.handle.isActive()) return false
    index = buildEvidenceIndex(storyFiles, evidence)
    // Only events up to the analysis start are covered by the new evidence.
    for (const [id, order] of stale) {
      if (order <= started) stale.delete(id)
    }
    if (staleAll <= started) staleAll = 0
    return true
  }

  /** Late-bound so the outdating hook can schedule the selector's own refresh. */
  const refreshNow = () => selector.refresh()

  /**
   * Marks graphs an event outdated until a later analysis succeeds, and
   * schedules that analysis once edits settle: not every outdating event (a
   * new helper file) is followed by a collection that would refresh it.
   */
  function markStale(change: AffectedChange) {
    if (change.whole) {
      staleAll = change.seq
    }
    else {
      for (const id of change.proven) stale.set(id, change.seq)
    }
    if (!change.whole && !change.proven.length) return
    clearTimeout(settle)
    settle = setTimeout(() => void refreshNow(), options.settleMs ?? 300)
    settle.unref()
  }

  const selector = {
    /**
     * Rebuilds the evidence index from the eligibility service. Replaces the
     * retained index only on success; failure, cancellation or an edit during
     * analysis keep the old graph. Concurrent calls coalesce into one rerun.
     * @returns Whether the index was replaced by this call's pass.
     */
    refresh(): Promise<boolean> {
      if (refreshing) {
        again = true
        return refreshing
      }
      const run = (async () => {
        let replaced = await analyze()
        while (again && !options.signal.aborted) {
          again = false
          replaced = await analyze()
        }
        return replaced
      })()
      refreshing = run.finally(() => {
        refreshing = undefined
      })
      return refreshing
    },
    /**
     * Classifies one file event against the retained index. Graphs the event
     * outdates are marked before anything is awaited, so evidence order equals
     * event order. Unwatched leaves are rechecked for any non-ignored event.
     * @param event Chokidar event name.
     * @param file Absolute changed path.
     */
    async classify(event: string, file: string): Promise<AffectedChange> {
      const retained = index
      const change: AffectedChange = { ...classifyFileEvent(retained, { stale: new Set(stale.keys()), all: staleAll > 0 }, ctx.root, event, file), seq: ++seq }
      if (change.reason === 'ignored') return change
      markStale(change)
      const generation = retained.known ? captureTestCollectionGeneration(ctx) : undefined
      const merged = withLeafOwners(change, generation ? await findChangedLeaves(retained, generation) : [])
      if (merged !== change) markStale(merged)
      return merged
    },
    /**
     * Rechecks unwatched leaves after a completed collection; unchanged
     * revalidation selects nothing.
     * @returns The leaf change, or `undefined` when nothing moved.
     */
    async checkLeaves(): Promise<AffectedChange | undefined> {
      const retained = index
      const generation = retained.known ? captureTestCollectionGeneration(ctx) : undefined
      const ids = generation ? await findChangedLeaves(retained, generation) : []
      if (!ids.length) return undefined
      const change = withLeafOwners({ event: 'collection', file: '', reason: 'leaf', storyIds: [], proven: [], whole: false, conservative: false, seq: ++seq }, ids)
      markStale(change)
      return change
    },
    /**
     * Receives every change that selects something, from watcher events and
     * leaf rechecks. Slice 10 accumulates these and calls `select` when a run
     * is safe.
     * @param listener Change receiver.
     * @returns Unsubscribe.
     */
    onChange(listener: AffectedListener): () => void {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /**
     * Intersects accumulated changes with an exact scope against the current catalog.
     * @param scope All, one story, or one variant.
     * @param changes Changes since the last scheduled run.
     */
    select(scope: TestTarget, changes: readonly AffectedChange[]): AffectedSelection {
      return selectAffected(options.catalog?.current, ctx.root, scope, changes)
    },
    /** Resumes observing file and collection events (idempotent); the caller refreshes evidence afterwards. */
    attach,
    /** Stops observing and scheduled re-analysis (idempotent); the retained evidence is kept. */
    detach,
    /** Counts of the retained evidence, for status lines and tests. */
    status() {
      return { known: index.known, proven: index.stories.size, unresolved: index.unresolved.size, stale: staleAll > 0 ? 'all' as const : stale.size }
    },
  }

  const watcher = options.handle.server.watcher
  /** Every watcher event is classified once, in arrival order. */
  const onFile = (event: string, file: string) => {
    selector.classify(event, file).then(publish, error => console.error(error))
  }
  const onCollected = async (event: { phase: string }) => {
    if (event.phase !== 'completed') return
    // Never block the collection loop: leaf proof and re-analysis run behind it.
    void (async () => {
      const leaf = await selector.checkLeaves()
      if (leaf) publish(leaf)
      await selector.refresh()
    })().catch(error => console.error(error))
  }
  let offCollection: (() => void) | undefined

  /** Starts observing file and collection events; no-op while attached or after release. */
  function attach() {
    if (offCollection || options.signal.aborted) return
    watcher.on('all', onFile)
    offCollection = options.handle.onCollection(onCollected)
  }

  /** Stops observing and drops scheduled re-analysis; the retained evidence stays for a later `refresh`. */
  function detach() {
    if (!offCollection) return
    watcher.off('all', onFile)
    offCollection()
    offCollection = undefined
    clearTimeout(settle)
    again = false
  }
  attach()
  options.signal.addEventListener('abort', () => {
    detach()
    listeners.clear()
  }, { once: true })
  return selector
}

/** Per-generation selector. */
export type AffectedSelector = ReturnType<typeof createAffectedSelector>
