import type { HistoireCatalog, HistoireSourceIdentity, HistoireTarget, HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { WorkbenchTestEntry, WorkbenchTestsOptions } from './types.js'
import { getHistoireTargetKey, HistoireSdkError } from '@histoire/protocol'
import { createHistoireTestSummary } from '@histoire/shared'

/** One server admission may execute many variants without another browser worker. */
export interface WorkbenchTestJob {
  /** Exact targets owned by this admission, captured before asynchronous execution. */
  targets: readonly HistoireTarget[]
  /** Bulk jobs lack attributable individual variant timing. */
  bulk: boolean
  /** Adapter keeps server lane and cleanup ownership. */
  run: (signal: AbortSignal) => Promise<HistoireTestRunSummary>
}

/** Prefer one project worker or one worker per changed story, preserving finite fallback. */
export function createWorkbenchTestJobs(targets: readonly HistoireTarget[], options: WorkbenchTestsOptions, project: boolean): WorkbenchTestJob[] {
  if (project && options.runProject) return [{ targets, bulk: true, run: options.runProject }]
  if (options.runStory) {
    const stories = new Map<string, HistoireTarget[]>()
    for (const target of targets) stories.set(target.storyId, [...stories.get(target.storyId) ?? [], target])
    return [...stories].map(([storyId, targets]) => ({ targets, bulk: true, run: signal => options.runStory!(storyId, signal) }))
  }
  return options.run ? targets.map(target => ({ targets: [target], bulk: false, run: signal => options.run!(target, signal) })) : []
}

/** Optional server provenance must describe the exact publication captured at admission. */
export function assertWorkbenchTestRunOwner(result: HistoireTestRunSummary, source: HistoireSourceIdentity | null): void {
  const execution = result.execution
  if (execution && (execution.mode !== 'server' || execution.sourceId !== source?.sourceId || execution.epoch !== source?.epoch || execution.revision !== source?.revision)) throw new HistoireSdkError('STALE_REVISION', 'Project test result belongs to another source publication')
}

/** Fan server cases into exact variant facts; project totals never become one variant's result. */
export function projectWorkbenchTestResult(result: HistoireTestRunSummary, targets: readonly HistoireTarget[], catalog: HistoireCatalog, bulk: boolean): Map<string, Partial<WorkbenchTestEntry>> {
  if (!bulk && targets.length === 1) return new Map([[getHistoireTargetKey(targets[0]), { summary: result, error: null, collection: collectionFromTests(result.tests) }]])
  const grouped = new Map<string, HistoireTestRunSummary['tests']>()
  for (const test of result.tests) {
    if (test.storyId === undefined || test.variantId === undefined) throw new HistoireSdkError('INVALID_ARGUMENT', 'Project test case has no target attribution')
    const key = getHistoireTargetKey({ storyId: test.storyId, variantId: test.variantId })
    grouped.set(key, [...grouped.get(key) ?? [], test])
  }
  const patches = new Map<string, Partial<WorkbenchTestEntry>>()
  for (const target of targets) {
    if (target.variantId === null) continue
    const key = getHistoireTargetKey(target)
    const relativePath = catalog.stories.find(story => story.id === target.storyId)?.relativePath
    const issue = result.uncollectedStories?.find(story => story.relativePath === relativePath)
    if (issue) {
      patches.set(key, { summary: null, collection: null, error: issue.error })
      continue
    }
    const tests = grouped.get(key) ?? []
    const summary = createHistoireTestSummary(target.storyId, target.variantId, tests)
    if (result.execution) summary.execution = { ...result.execution, target }
    patches.set(key, { summary, error: null, collection: collectionFromTests(tests) })
  }
  return patches
}

/** Completed assertion work supplies current definitions, including successful empty collections. */
function collectionFromTests(tests: HistoireTestRunSummary['tests']): HistoireTestCollectionResult {
  return { definitions: tests.map(test => ({ id: test.id, name: test.name, fullName: test.fullName, ...(test.state === 'skipped' ? { mode: 'skip' as const } : {}) })) }
}
