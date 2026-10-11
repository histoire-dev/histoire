import type { HistoireVisualApprovalReceipt, HistoireVisualCase, HistoireVisualRunSummary } from '@histoire/shared'
import type { PreparedVisualApproval, VisualApprovalItem } from './approve-prepare.js'
import type { VisualApprovalFence } from './approve-publish.js'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualEvidence } from './recovery.js'
import type { VisualSource } from './source.js'
import { prepareVisualApproval } from './approve-prepare.js'
import { publishVisualApprovals } from './approve-publish.js'
import { listVisualCases } from './cases.js'
import { forEachVisualConcurrent } from './concurrency.js'
import { discardVisualStagedWrite } from './files.js'
import { persistVisualEvidence, readVisualEvidence } from './recovery.js'
import { writeVisualReport } from './report.js'

export type { VisualApprovalItem } from './approve-prepare.js'

/** Bounded parallel filesystem work per approval group. */
export const VISUAL_APPROVAL_CONCURRENCY = 8

/** Internal authority for an independently completed, revalidated recovery record. */
export interface VisualApprovalAuthority {
  /** Only recovery sessions may approve a finished record from an interrupted run. */
  independentCapture?: boolean
  /** Current source content is checked again, once per group, immediately before metadata publication. */
  prepareFence?: (items: VisualApprovalItem[]) => Promise<VisualApprovalFence>
  /** Recovered approvals update original report separately, preserving its lifecycle. */
  writeReport?: boolean
  /** One request owns a resolved catalog snapshot, checked again at publication. */
  cases?: readonly HistoireVisualCase[]
  /** Persist report repair marker once per affected run without scanning unrelated records. */
  afterApproval?: (evidence: VisualEvidence) => Promise<void>
}

/** Receipt keeps conflicts retryable and distinct from hard failures. */
function receipt(resultId: string, error: unknown): HistoireVisualApprovalReceipt {
  if (error === undefined) return { resultId, status: 'approved' }
  const message = error instanceof Error ? error.message.slice(0, 256) : 'Baseline approval failed'
  return { resultId, status: /changed|locked/.test(message) ? 'conflict' : 'error', error: message }
}

/** Record evidence for published approvals, then mark each affected run's report once. */
async function persistApprovals(source: VisualSource, published: PreparedVisualApproval[], errors: Map<VisualApprovalItem, unknown>, authority: VisualApprovalAuthority): Promise<void> {
  const runs = new Map<string, { evidence: VisualEvidence, items: VisualApprovalItem[] }>()
  await forEachVisualConcurrent(published, VISUAL_APPROVAL_CONCURRENCY, async ({ item }) => {
    try {
      const evidence = item.evidence ?? await readVisualEvidence(source.ctx.root, item.run.id, item.result.id)
      if (!evidence) return
      evidence.result = structuredClone(item.result)
      await persistVisualEvidence(source.ctx.root, evidence)
      const run = runs.get(evidence.run.id) ?? { evidence, items: [] }
      run.items.push(item)
      runs.set(evidence.run.id, run)
    }
    catch (error) { errors.set(item, error) }
  })
  if (!authority.afterApproval) return
  for (const { evidence, items } of runs.values()) {
    try {
      await authority.afterApproval(evidence)
    }
    catch (error) { for (const item of items) errors.set(item, error) }
  }
}

/**
 * Approve exact retained captures as one group: lock and stage each item, prepare one source fence,
 * then publish every still-valid item in a single synchronous pass. Receipts follow item order.
 */
export async function approveVisualItems(source: VisualSource, config: ResolvedVisualConfig, items: VisualApprovalItem[], authority: VisualApprovalAuthority = {}): Promise<HistoireVisualApprovalReceipt[]> {
  const errors = new Map<VisualApprovalItem, unknown>()
  const prepared: PreparedVisualApproval[] = []
  try {
    const cases = authority.cases ?? await listVisualCases(source.ctx, config)
    await forEachVisualConcurrent(items, VISUAL_APPROVAL_CONCURRENCY, async (item) => {
      try {
        prepared.push(await prepareVisualApproval(source, config, item, cases, authority.independentCapture))
      }
      catch (error) { errors.set(item, error) }
    })
    if (prepared.length) {
      const fence = await authority.prepareFence?.(prepared.map(entry => entry.item))
      for (const [entry, error] of publishVisualApprovals(source, config, prepared, fence)) errors.set(entry.item, error)
      await persistApprovals(source, prepared.filter(entry => !errors.has(entry.item)), errors, authority)
    }
  }
  catch (error) {
    // Only catalog listing and fence preparation reach here, both before any publication.
    for (const item of items) {
      if (!errors.has(item)) errors.set(item, error)
    }
  }
  finally {
    await Promise.all(prepared.map(async (entry) => {
      await discardVisualStagedWrite(entry.staged)
      await entry.release()
    }))
  }
  return items.map(item => receipt(item.result.id, errors.get(item)))
}

/** Approve only exact retained captures of one run after all ownership and revision checks. */
export async function approveVisualResults(source: VisualSource, config: ResolvedVisualConfig, run: HistoireVisualRunSummary, ids: string[], authority: VisualApprovalAuthority = {}): Promise<HistoireVisualApprovalReceipt[]> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 256 || new Set(ids).size !== ids.length) {
    throw new Error('Select 1–256 distinct visual results')
  }
  const items = new Map<string, VisualApprovalItem>()
  for (const id of ids) {
    const result = run.results.find(value => value.id === id)
    if (result) items.set(id, { run, result })
  }
  const approved = new Map((await approveVisualItems(source, config, [...items.values()], authority)).map(value => [value.resultId, value]))
  const receipts = ids.map(id => approved.get(id) ?? receipt(id, new Error('Visual result has no completed capture to approve')))
  run.ok = run.state === 'completed' && run.results.every(result => result.status === 'passed' || result.approved)
  if (authority.writeReport !== false) await writeVisualReport(source.ctx.root, run)
  return receipts
}
