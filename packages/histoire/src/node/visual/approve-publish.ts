import type { PreparedVisualApproval, VisualApprovalItem } from './approve-prepare.js'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualSource } from './source.js'
import { VISUAL_BASELINE_METADATA_LIMIT } from './baseline.js'
import { publishVisualStagedWrite, readVisualPublicationFile } from './files.js'
import { stableVisualJson, visualHash } from './identity.js'
import { visualCaptureSpec } from './spec.js'

/** Opens one synchronous publication pass; returned check throws when an item lost its authority. */
export type VisualApprovalFence = () => (item: VisualApprovalItem) => void

/** Recheck saved definition, baseline CAS and published image for one staged approval. */
function checkStagedApproval(source: VisualSource, config: ResolvedVisualConfig, entry: PreparedVisualApproval): void {
  const { run, result } = entry.item
  if (!source.isActive() || run.stale) throw new Error('Visual source changed; run comparisons again')
  const definition = entry.casePath && readVisualPublicationFile(entry.casePath)
  if ((entry.casePath && (!definition || stableVisualJson(JSON.parse(definition.toString())) !== stableVisualJson(entry.case))) || stableVisualJson(visualCaptureSpec(source, config, entry.case, result.spec.id)) !== stableVisualJson(result.spec)) {
    throw new Error('Visual case or profile changed; run comparisons again')
  }
  const baseline = readVisualPublicationFile(entry.staged.path, VISUAL_BASELINE_METADATA_LIMIT)
  if ((baseline ? visualHash(baseline) : null) !== result.workingRevision) throw new Error('Visual baseline changed since capture; run comparisons again')
  const publishedImage = readVisualPublicationFile(entry.imagePath, 4 * 1024 * 1024)
  if (!publishedImage || visualHash(publishedImage) !== result.currentHash) throw new Error('Working baseline image changed; run comparisons again')
}

/**
 * Fence, check and rename every staged approval in one synchronous pass, so no asynchronous work
 * runs between final source fence and publication. Failures stay scoped to their own item.
 */
export function publishVisualApprovals(source: VisualSource, config: ResolvedVisualConfig, prepared: PreparedVisualApproval[], fence?: VisualApprovalFence): Map<PreparedVisualApproval, unknown> {
  const failures = new Map<PreparedVisualApproval, unknown>()
  let check: ((item: VisualApprovalItem) => void) | undefined
  try {
    check = fence?.()
  }
  catch (error) {
    for (const entry of prepared) failures.set(entry, error)
    return failures
  }
  for (const entry of prepared) {
    try {
      check?.(entry.item)
      checkStagedApproval(source, config, entry)
      publishVisualStagedWrite(entry.staged)
      entry.item.result.workingRevision = entry.revision
      entry.item.result.approved = true
    }
    catch (error) { failures.set(entry, error) }
  }
  return failures
}
