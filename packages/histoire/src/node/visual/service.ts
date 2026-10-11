import type { HistoireVisualApproveOptions, HistoireVisualRunOptions, HistoireVisualRunSummary } from '@histoire/shared'
import type { VisualSource } from './source.js'
import { approveVisualResults } from './approve.js'
import { listVisualCases, saveVisualCase } from './cases.js'
import { resolveVisualConfig } from './config.js'
import { removeVisualFile } from './files.js'
import { createVisualReportQueue } from './report-queue.js'
import { createVisualReviewSession } from './review-session.js'
import { runVisualComparisons } from './run.js'
import { visualSnapshot } from './snapshot.js'
import { onVisualSourceRetired } from './source.js'

/** Retained source and mutable evidence stay private to one service owner. */
export function createVisualService(resolveSource: () => VisualSource) {
  const runs = new Map<string, { source: VisualSource, run: HistoireVisualRunSummary }>()
  const active = new Set<{ abort: AbortController, done: Promise<unknown> }>()
  const reports = new Map<string, ReturnType<typeof createVisualReportQueue>>()
  const reviews = new Set<ReturnType<typeof createVisualReviewSession>>()
  let closed = false
  /** Resolve current source and opt-in policy without acquiring a browser. */
  function current() {
    if (closed) {
      throw new Error('Visual service closed')
    }
    const source = resolveSource()
    const config = resolveVisualConfig(source.ctx.config.visual)
    if (!config) {
      throw new Error('Visual testing is disabled; add visual: {} to histoire.config')
    }
    return { source, config }
  }
  return {
    /** Independent review authority belongs to one browser socket. */
    createReviewSession() {
      const root = current().source.ctx.root
      if (!reports.has(root)) reports.set(root, createVisualReportQueue(root))
      const review = createVisualReviewSession(current, reports.get(root)!)
      reviews.add(review)
      return { ...review,
        /** Remove retired sessions after their writes drain, keeping teardown ownership. */
        close() { return review.close().finally(() => reviews.delete(review)) } }
    },
    /** Current canonical and explicitly saved Matrix inventory. */
    async listCases() {
      const { source, config } = current()
      return visualSnapshot(await listVisualCases(source.ctx, config))
    },
    /** Save complete props without altering project story source. */
    async saveCase(input: Parameters<typeof saveVisualCase>[2]) {
      const { source, config } = current()
      return visualSnapshot(await saveVisualCase(source.ctx, config, input))
    },
    /** Remove only saved definition, keeping historical baselines and captures. */
    async removeCase(caseId: string) {
      const { source, config } = current()
      if (!/^[a-f0-9]{64}$/.test(caseId)) {
        throw new Error('Invalid saved visual case ID')
      }
      await removeVisualFile(source.ctx.root, `${config.baselineDir}/cases/${caseId}.json`)
    },
    /** Each run owns one cancellation scope over shared execution; `plan` receives incremental targets. */
    run(options: HistoireVisualRunOptions = {}, observe: (run: HistoireVisualRunSummary) => void = () => {}, plan?: (resultIds: string[]) => void) {
      const { source, config } = current()
      const abort = new AbortController()
      const stopRetirement = onVisualSourceRetired(source.server, () => abort.abort())
      const signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal
      const operation = { abort, done: undefined as Promise<unknown> }
      const done = runVisualComparisons(source, config, options, signal, (run) => {
        runs.set(run.id, { source, run })
        observe(visualSnapshot(run))
      }, plan).then(run => visualSnapshot(run)).finally(() => {
        stopRetirement()
        active.delete(operation)
        // Retain latest evidence; old artifacts remain inspectable from disk.
        if (runs.size > 20) {
          for (const [id, entry] of runs) {
            if (entry.run.state !== 'running') {
              runs.delete(id)
              break
            }
          }
        }
      })
      operation.done = done
      active.add(operation)
      return done
    },
    /** Snapshot page readers cannot mutate retained private evidence. */
    getRun(id: string) {
      const entry = runs.get(id)
      if (!entry) {
        return undefined
      }
      const run = visualSnapshot({ ...entry.run, stale: !entry.source.isActive() || Boolean(entry.run.stale) })
      return run
    },
    /** Filesystem CAS and generation checks guard every selected baseline. */
    async approve(options: HistoireVisualApproveOptions) {
      current()
      const entry = runs.get(options.runId)
      if (!entry) {
        throw new Error('Visual run unavailable; run comparisons again')
      }
      const config = resolveVisualConfig(entry.source.ctx.config.visual)!
      return visualSnapshot(await approveVisualResults(entry.source, config, entry.run, options.resultIds))
    },
    /** Close stops owned captures and joins their browser cleanup. */
    async close() {
      closed = true
      for (const operation of active) {
        operation.abort.abort()
      }
      await Promise.all([...reviews].map(review => review.close()))
      reviews.clear()
      await Promise.allSettled([...active].map(operation => operation.done))
      await Promise.all([...reports.values()].map(queue => queue.flush()))
      reports.clear()
      runs.clear()
    },
  }
}
