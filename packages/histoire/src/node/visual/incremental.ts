import type { HistoireVisualCase, HistoireVisualResult, HistoireVisualRunSummary } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualSource } from './source.js'
import { listVisualCases } from './cases.js'
import { createVisualFingerprintValidation } from './fingerprint.js'
import { readVisualLatestEvidence, validateVisualEvidence, visualComparisonKey } from './recovery.js'

/** Comparisons an incremental run must capture, plus a tally of reused evidence. */
export interface VisualIncrementalPlan {
  /** Planned comparisons lacking valid retained evidence. */
  needed: HistoireVisualResult[]
  /** Skipped comparisons; failing ones still await review. */
  reused: { total: number, failing: number }
}

/**
 * Keep only comparisons whose latest evidence is absent, invalid, stale, errored, or cancelled.
 * Valid pending-review captures are skipped: recapturing unchanged inputs yields identical pixels.
 */
export async function planVisualIncremental(source: VisualSource, config: ResolvedVisualConfig, run: Pick<HistoireVisualRunSummary, 'platform' | 'baselineSource'>, planned: HistoireVisualResult[], cases?: readonly HistoireVisualCase[]): Promise<VisualIncrementalPlan> {
  const current = cases ?? await listVisualCases(source.ctx, config)
  // Shared memo hashes each common dependency (config, lockfiles, setup) once for whole plan.
  const fingerprint = createVisualFingerprintValidation()
  const needed: HistoireVisualResult[] = []
  const reused = { total: 0, failing: 0 }
  for (const result of planned) {
    try {
      const evidence = await readVisualLatestEvidence(source.ctx.root, visualComparisonKey(run, result, config.baselineDir))
      if (!evidence || evidence.result.status === 'error' || await validateVisualEvidence(source, config, evidence, false, current, { artifacts: new Map(), fingerprint })) {
        needed.push(result)
        continue
      }
      reused.total++
      if (evidence.result.status !== 'passed' && !evidence.result.approved) reused.failing++
    }
    catch {
      // Unreadable or tampered evidence cannot be trusted; recapture replaces it.
      needed.push(result)
    }
  }
  return { needed, reused }
}
