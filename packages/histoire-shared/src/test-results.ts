import type {
  HistoireResolvedTestCase,
  HistoireSerializedTestDefinition,
  HistoireTestCaseResultInput,
  HistoireTestDefinition,
  HistoireTestRunSummary,
} from './types/test.js'
import { serializeTestError } from './test-errors.js'

/** Merge existing summaries without changing per-variant test identities or semantics. */
export function mergeHistoireTestSummaries(values: HistoireTestRunSummary[]): HistoireTestRunSummary {
  const summary: HistoireTestRunSummary = { ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }
  for (const value of values) {
    summary.ok &&= value.ok
    summary.total += value.total
    summary.passed += value.passed
    summary.failed += value.failed
    summary.skipped += value.skipped
    for (const error of value.errors) summary.errors.push(error)
    for (const test of value.tests) summary.tests.push(test)
    for (const story of value.uncollectedStories ?? []) (summary.uncollectedStories ??= []).push(story)
  }
  return summary
}

export function serializeTestDefinitions(definitions: HistoireTestDefinition[]): HistoireSerializedTestDefinition[] {
  return definitions.map(({ id, name, fullName, mode, timeout }) => ({
    id,
    name,
    fullName,
    ...(mode ? { mode } : {}),
    ...(timeout === undefined ? {} : { timeout }),
  }))
}

export function mergeTestDefinitionsAndSummary(
  definitions: HistoireSerializedTestDefinition[],
  summary: HistoireTestRunSummary | null | undefined,
): HistoireResolvedTestCase[] {
  const testMap = new Map(summary?.tests.map(test => [test.id, test]) ?? [])
  const matchedIds = new Set<string>()

  const resolved: HistoireResolvedTestCase[] = definitions.map((definition) => {
    const test = testMap.get(definition.id)
    if (test) {
      matchedIds.add(test.id)
    }

    return {
      ...definition,
      state: test?.state ?? 'idle',
      errors: test?.errors ?? [],
      storyId: test?.storyId,
      variantId: test?.variantId,
    }
  })

  // Summary entries with no matching definition — e.g. the synthetic test of
  // a run-level failure — must stay visible: dropping them shows "Failed 1"
  // in the tags while no failing test is listed anywhere.
  for (const test of summary?.tests ?? []) {
    if (matchedIds.has(test.id)) {
      continue
    }

    resolved.push({
      id: test.id,
      name: test.name,
      fullName: test.fullName,
      state: test.state,
      errors: test.errors,
      storyId: test.storyId,
      variantId: test.variantId,
    })
  }

  return resolved
}

export function createHistoireTestSummary(storyId: string, variantId: string, tests: HistoireTestCaseResultInput[]): HistoireTestRunSummary {
  const errors = tests.flatMap(test => test.errors)
  const passed = tests.filter(test => test.state === 'passed').length
  const failed = tests.filter(test => test.state === 'failed').length
  const skipped = tests.filter(test => test.state === 'skipped').length

  return {
    ok: failed === 0,
    total: tests.length,
    passed,
    failed,
    skipped,
    errors,
    tests: tests.map((test, index) => ({
      id: test.id ?? `${storyId}:${variantId}:${index}`,
      name: test.name,
      fullName: test.fullName ?? `${storyId} > ${variantId} > ${test.name}`,
      state: test.state,
      errors: test.errors,
      storyId,
      variantId,
    })),
  }
}

/**
 * Builds the summary of a run that failed as a whole (the tests never got to
 * report individually): the failure is surfaced as one synthetic failed test,
 * so the panel shows it instead of an empty, seemingly-passing run.
 * @param storyId Story the run targeted.
 * @param variantId Variant the run targeted.
 * @param error What ended the run.
 */
export function createFailedRunSummary(storyId: string, variantId: string, error: unknown): HistoireTestRunSummary {
  return createHistoireTestSummary(storyId, variantId, [{
    name: 'run',
    state: 'failed',
    errors: [serializeTestError(error)],
  }])
}
