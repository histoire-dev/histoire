import type { HistoireVisualApprovalReceipt, HistoireVisualRunSummary, UiVisualResult } from '@histoire/shared'
import type { VisualApprovalItem } from './approve.js'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualEvidence, VisualEvidenceValidation } from './recovery.js'
import type { VisualSource } from './source.js'
import { randomUUID } from 'node:crypto'
import { approveVisualItems, VISUAL_APPROVAL_CONCURRENCY } from './approve.js'
import { listVisualCases } from './cases.js'
import { forEachVisualConcurrent } from './concurrency.js'
import { readVisualPublicationFile, safeVisualPath } from './files.js'
import { createVisualFingerprintFence, createVisualFingerprintValidation } from './fingerprint.js'
import { visualHash } from './identity.js'
import { createVisualRecoveryPages } from './recovery-pages.js'
import { activeVisualRuns, readVisualEvidence, recoverVisualEvidence, validateVisualEvidence, visualComparisonKey } from './recovery.js'
import { createVisualReportQueue } from './report-queue.js'
import { visualReviewResult } from './review.js'
import { visualSnapshot } from './snapshot.js'

/** Registered review entry: validated evidence and its browser-facing result. */
interface SessionEntry {
  /** Validated retained evidence. */
  evidence: VisualEvidence
  /** Result sent to owning browser. */
  result: UiVisualResult
  /** Source generation owning live capture, absent for recovered results. */
  liveSource?: VisualSource
}

/** Validated selection awaiting group publication. */
interface SessionApproval {
  /** Selection position, preserving receipt order. */
  index: number
  /** Registered review entry. */
  entry: SessionEntry
  /** Live capture of still-active source generation. */
  live: boolean
  /** Retained artifacts reread by final fence. */
  artifactFiles: { path: string, hash: string }[]
  /** Approval input shared with publication core. */
  item: VisualApprovalItem
}

/** Session failures for missing or moved authority remain retryable conflicts. */
function failure(resultId: string, error: unknown): HistoireVisualApprovalReceipt {
  const message = error instanceof Error ? error.message.slice(0, 256) : 'Visual approval failed'
  return { resultId, status: /changed|moved|locked|removed|unavailable/.test(message) ? 'conflict' : 'error', error: message }
}

/** Browser-owned handles bind historical evidence to current generation, never another socket. */
export function createVisualReviewSession(current: () => { source: VisualSource, config: ResolvedVisualConfig }, sharedReports?: ReturnType<typeof createVisualReportQueue>) {
  const reports = sharedReports ?? createVisualReportQueue(current().source.ctx.root)
  const entries = new Map<string, SessionEntry>()
  const approvals = new Set<Promise<HistoireVisualApprovalReceipt[]>>()
  let retirement: Promise<void> | undefined
  let closed = false
  /** Register only validated metadata; clients receive no paths or fingerprint authority. */
  function register(evidence: VisualEvidence, restored: boolean, liveSource?: VisualSource): UiVisualResult {
    const existing = [...entries.values()].find(entry => entry.evidence.run.id === evidence.run.id && entry.evidence.result.id === evidence.result.id)
    const handle = existing?.result.reviewHandle ?? randomUUID()
    const result: UiVisualResult = { ...visualReviewResult(evidence.result), artifactRunId: evidence.run.id, comparisonKey: evidence.key, capturedAt: evidence.capturedAt, restored, staleReason: evidence.staleReason, baselineSource: evidence.run.baselineSource, baselineCommit: evidence.run.baselineCommit, reviewHandle: handle }
    entries.set(handle, { evidence, result, liveSource })
    return result
  }
  const recovery = createVisualRecoveryPages(current, evidence => register(evidence, true))
  /** Validate exact browser authority, then publish all valid retained-image baselines as one group. */
  async function approve(selections: { handle: string, resultId: string }[], observe: (receipts: HistoireVisualApprovalReceipt[]) => void | Promise<void> = () => {}): Promise<HistoireVisualApprovalReceipt[]> {
    if (closed) throw new Error('Visual review session closed')
    const receipts = new Map<number, HistoireVisualApprovalReceipt>()
    const { source, config } = current()
    const cases = await listVisualCases(source.ctx, config)
    const fingerprint = createVisualFingerprintValidation()
    const approvals: SessionApproval[] = []
    const failures: HistoireVisualApprovalReceipt[] = []
    await forEachVisualConcurrent(selections.map((selection, index) => ({ selection, index })), VISUAL_APPROVAL_CONCURRENCY, async ({ selection, index }) => {
      const entry = entries.get(selection.handle)
      try {
        if (!entry || entry.evidence.result.id !== selection.resultId) throw new Error('Visual result unavailable for this browser')
        if (activeVisualRuns.has(entry.evidence.run.id)) throw new Error('Visual capture still running')
        const live = !!entry.liveSource
        if (live && !entry.liveSource!.isActive()) throw new Error('Source changed since capture')
        const validation: VisualEvidenceValidation = { artifacts: new Map(), fingerprint }
        const reason = await validateVisualEvidence(source, config, entry.evidence, live, cases, validation)
        if (reason) throw new Error(reason)
        // Independent completed record, not a forged completion of its original run.
        const retained = entry.evidence
        const artifactFiles = await Promise.all([...validation.artifacts].map(async ([path, bytes]) => ({ path: await safeVisualPath(source.ctx.root, path), hash: visualHash(bytes) })))
        const image = validation.artifacts.get(`.histoire/visual/runs/${retained.run.id}/images/${retained.result.images.current}`)
        approvals.push({ index, entry, live, artifactFiles, item: { run: { ...retained.run, stale: false, results: [retained.result] }, result: retained.result, evidence: retained, image } })
      }
      catch (error) {
        const receipt = failure(selection.resultId, error)
        receipts.set(index, receipt)
        failures.push(receipt)
      }
    })
    if (!closed && failures.length) await observe(failures)
    // Concurrent validation finishes out of order; publish and stream in selection order.
    approvals.sort((a, b) => a.index - b.index)
    if (approvals.length) {
      const owners = new Map(approvals.map(approval => [approval.item, approval]))
      const published = await approveVisualItems(source, config, approvals.map(approval => approval.item), { independentCapture: true, writeReport: false, cases, afterApproval: reports.mark, prepareFence: async (items) => {
        if (closed) throw new Error('Visual review session closed')
        const open = await createVisualFingerprintFence(source, items.map(item => ({ fingerprint: owners.get(item)!.entry.evidence.fingerprint, live: owners.get(item)!.live })), fingerprint)
        return () => {
          if (closed) throw new Error('Visual review session closed')
          const check = open()
          return (item) => {
            const { entry, live, artifactFiles } = owners.get(item)!
            if (live && !entry.liveSource!.isActive()) throw new Error('Source changed since capture')
            check(entry.evidence.fingerprint)
            for (const file of artifactFiles) {
              const bytes = readVisualPublicationFile(file.path, 4 * 1024 * 1024)
              if (!bytes || visualHash(bytes) !== file.hash) throw new Error('Retained visual image missing or changed')
            }
          }
        }
      } })
      published.forEach((receipt, index) => {
        const { entry, item } = approvals[index]
        receipts.set(approvals[index].index, receipt)
        entry.result = { ...entry.result, approved: item.result.approved }
      })
      if (!closed) await observe(published)
    }
    return selections.map((_, index) => receipts.get(index)!)
  }
  return {
    /** Browser recovery validates only requested page instead of entire historical collection. */
    async recoverPage(offset = 0) {
      if (!offset) await reports.recover()
      const page = await recovery.page(offset)
      return { ...page, issues: [...page.issues, ...(!offset ? reports.issues() : [])].slice(0, 32) }
    },
    /** Recover historical evidence without launching browser or running a story. */
    async recover() {
      if (closed) throw new Error('Visual review session closed')
      const { source, config } = current()
      await reports.recover()
      const recovered = await recoverVisualEvidence(source, config)
      if (closed || !source.isActive()) throw new Error('Visual source changed during recovery')
      return { results: recovered.entries.map(entry => register(entry, true)), issues: [...recovered.issues, ...reports.issues()] }
    },
    /** Claim own live results, preserving cancelled outcomes without recovery authority. */
    async claim(run: HistoireVisualRunSummary, offset = 0, limit = run.results.length) {
      const { source, config } = current()
      const results: UiVisualResult[] = []
      for (const result of run.results.slice(offset, offset + limit)) {
        const evidence = await readVisualEvidence(source.ctx.root, run.id, result.id)
        if (!evidence) {
          results.push({ ...visualReviewResult(result), artifactRunId: run.id, comparisonKey: visualComparisonKey(run, result, config.baselineDir), baselineSource: run.baselineSource, baselineCommit: run.baselineCommit, staleReason: run.stale ? 'Source changed since capture' : undefined })
          continue
        }
        evidence.staleReason = run.stale ? 'Source changed since capture' : await validateVisualEvidence(source, config, evidence, true)
        results.push(register(evidence, false, run.stale ? undefined : source))
      }
      if (closed) throw new Error('Visual review session closed')
      return visualSnapshot(results)
    },
    /** Track owned work so teardown joins persistence before draining derived reports. */
    approve(selections: { handle: string, resultId: string }[], observe?: (receipts: HistoireVisualApprovalReceipt[]) => void | Promise<void>) {
      const resume = reports.hold()
      const operation = approve(selections, observe).finally(() => {
        approvals.delete(operation)
        resume()
      })
      approvals.add(operation)
      return operation
    },
    /** Explicit flush keeps Node/CLI and tests able to await derived reports. */
    flushReports: reports.flush,
    /** Derived-report failure never changes an already committed approval receipt. */
    reportIssues: reports.issues,
    /** Only registered opaque artifacts may be served by current HTTP generation. */
    artifact(runId: string, resultId: string, kind: 'baseline' | 'current' | 'diff') {
      if (closed) return
      return [...entries.values()].find(entry => entry.evidence.run.id === runId && entry.evidence.result.id === resultId)?.evidence.result.images[kind]
    },
    /** Socket retirement revokes all handles, without deleting durable cache. */
    close() {
      closed = true
      recovery.close()
      entries.clear()
      retirement ??= Promise.allSettled([...approvals]).then(async () => {
        if (!sharedReports) await reports.flush()
      })
      return retirement
    },
  }
}
