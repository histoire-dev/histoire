import type { HistoireVisualCase, HistoireVisualResult, HistoireVisualRunSummary } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualStagedWrite } from './files.js'
import type { VisualEvidence } from './recovery.js'
import type { VisualSource } from './source.js'
import { baselinePath, parseVisualBaseline, publishVisualBaselineImage, VISUAL_BASELINE_METADATA_LIMIT, visualBaselineBytes, workingBaselineRevision } from './baseline.js'
import { readVisualPngDimensions } from './compare.js'
import { acquireVisualLock, discardVisualStagedWrite, safeVisualPath, safeVisualRead, stageVisualWrite } from './files.js'
import { stableVisualJson, visualHash } from './identity.js'
import { visualCaptureSpec } from './spec.js'

/** One retained capture selected for approval. */
export interface VisualApprovalItem {
  /** Run owning result; recovered captures use independent single-result summary. */
  run: HistoireVisualRunSummary
  /** Exact captured outcome, updated in place once approved. */
  result: HistoireVisualResult
  /** Prepared browser evidence avoids rereading its recovery record. */
  evidence?: VisualEvidence
  /** Pixels already verified in this request; final fence rechecks retained file. */
  image?: Uint8Array
}

/** Locked, validated and staged approval awaiting group publication. */
export interface PreparedVisualApproval {
  /** Selected capture. */
  item: VisualApprovalItem
  /** Current catalog case matching captured spec. */
  case: HistoireVisualCase
  /** Baseline metadata written privately next to destination. */
  staged: VisualStagedWrite
  /** Working revision after publication. */
  revision: string
  /** Saved Matrix definition rechecked at publication. */
  casePath?: string
  /** Published content-addressed image rechecked at publication. */
  imagePath: string
  /** Release exclusive baseline lock. */
  release: () => Promise<void>
}

/** Lock baseline, check ownership and revisions, publish immutable image and stage metadata. */
export async function prepareVisualApproval(source: VisualSource, config: ResolvedVisualConfig, item: VisualApprovalItem, cases: readonly HistoireVisualCase[], independentCapture = false): Promise<PreparedVisualApproval> {
  const { run, result } = item
  const root = source.ctx.root
  if (!result.currentHash || !result.images.current || !['passed', 'missing', 'changed', 'incompatible'].includes(result.status) || (!independentCapture && run.state !== 'completed')) {
    throw new Error('Visual result has no completed capture to approve')
  }
  if (!source.isActive() || run.stale) {
    throw new Error('Visual source changed; run comparisons again')
  }
  const path = baselinePath(config, run.platform, result.case.id, result.spec.id)
  const release = await acquireVisualLock(root, path)
  let staged: VisualStagedWrite | undefined
  try {
    const current = cases.find(value => value.id === result.case.id)
    if (!source.isActive() || !current || stableVisualJson(visualCaptureSpec(source, config, current, result.spec.id)) !== stableVisualJson(result.spec)) {
      throw new Error('Visual case or profile changed; run comparisons again')
    }
    if (await workingBaselineRevision(root, path) !== result.workingRevision) {
      throw new Error('Visual baseline changed since capture; run comparisons again')
    }
    const image = item.image ?? await safeVisualRead(root, `.histoire/visual/runs/${run.id}/images/${result.images.current}`)
    if (!image || visualHash(image) !== result.currentHash) {
      throw new Error('Captured visual image missing or changed')
    }
    if (!item.image) {
      const dimensions = readVisualPngDimensions(image)
      if (dimensions.width !== result.currentDimensions?.width || dimensions.height !== result.currentDimensions?.height) {
        throw new Error('Captured visual dimensions changed')
      }
    }
    const existing = await safeVisualRead(root, path, VISUAL_BASELINE_METADATA_LIMIT)
    if (existing) {
      const baseline = parseVisualBaseline(existing, result.case.id, result.spec.id, run.platform)
      const approvedImage = await safeVisualRead(root, `${config.baselineDir}/images/${baseline.imageHash}.png`)
      if (!approvedImage || visualHash(approvedImage) !== baseline.imageHash) {
        throw new Error('Working baseline image changed; run comparisons again')
      }
    }
    if (!source.isActive()) {
      throw new Error('Visual source changed; run comparisons again')
    }
    const bytes = visualBaselineBytes(run.platform, result, await publishVisualBaselineImage(root, config, image))
    staged = await stageVisualWrite(root, path, bytes)
    // Staging can outlive initial validation; publication rechecks exact saved definition.
    const casePath = current.kind === 'matrix' ? await safeVisualPath(root, `${config.baselineDir}/cases/${current.id}.json`) : undefined
    const imagePath = await safeVisualPath(root, `${config.baselineDir}/images/${result.currentHash}.png`)
    return { item, case: current, staged, revision: visualHash(bytes), casePath, imagePath, release }
  }
  catch (error) {
    if (staged) await discardVisualStagedWrite(staged)
    await release()
    throw error
  }
}
