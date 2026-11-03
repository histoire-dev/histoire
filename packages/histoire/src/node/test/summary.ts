import type { HistoireTestCaseResultInput, HistoireTestError, HistoireTestRunSummary } from '@histoire/shared'
import type { TestModule } from 'vitest/node'
import type { GeneratedSpecFile } from './types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireTestSummary, HISTOIRE_UNHANDLED_ERROR_NAME, HISTOIRE_VARIANT_ERROR_TEST_NAME, mergeHistoireTestSummaries, readHistoireTestData, serializeTestErrors } from '@histoire/shared'
import { normalize } from 'pathe'
import pc from 'picocolors'

/**
 * Creates the summary of a run that executed no test at all.
 */
export function createEmptyTestSummary(): HistoireTestRunSummary {
  return mergeHistoireTestSummaries([])
}

/**
 * Turns the Vitest test modules of a run into a Histoire run summary.
 *
 * Each module is mapped back to its story/variant through the generated spec
 * path, so results reach the right variant in the app. Errors raised outside
 * test cases never discard the other results: module errors and unhandled
 * errors tagged with their spec become a failed {@link HISTOIRE_VARIANT_ERROR_TEST_NAME}
 * case of that variant, the remaining unhandled errors fail the run as a whole.
 * @param testModules The test modules Vitest executed.
 * @param specFiles The specs generated for this run.
 * @param unhandledErrors Errors Vitest caught outside test cases (`vitest.state.getUnhandledErrors()`).
 */
export function summarizeResults(testModules: TestModule[], specFiles: GeneratedSpecFile[], unhandledErrors: unknown[] = []): HistoireTestRunSummary {
  const fileMap = new Map(specFiles.map(item => [normalize(item.path), item]))
  const groupedTests = new Map<string, {
    storyId: string
    variantId: string
    tests: HistoireTestCaseResultInput[]
  }>()

  /** Appends a result to the variant owning the spec; unmapped specs land under `unknown:unknown`. */
  function push(meta: GeneratedSpecFile | undefined, test: Omit<HistoireTestCaseResultInput, 'id' | 'fullName'>) {
    // Reuse the portable tuple identity so delimiters inside IDs cannot merge
    // independent targets in a multi-story server run.
    const storyId = meta?.storyId ?? 'unknown'
    const variantId = meta?.variantId ?? 'unknown'
    const key = getHistoireTargetKey({ storyId, variantId })
    let bucket = groupedTests.get(key)
    if (!bucket) groupedTests.set(key, bucket = { storyId, variantId, tests: [] })
    bucket.tests.push({ ...test, id: String(bucket.tests.length), fullName: test.name })
  }

  /** Synthetic failed case carrying the errors a variant raised outside its tests. */
  function pushVariantErrors(meta: GeneratedSpecFile | undefined, errors: unknown[]) {
    if (errors.length) push(meta, { name: HISTOIRE_VARIANT_ERROR_TEST_NAME, state: 'failed', errors: serializeTestErrors(errors.map(withCauses)) })
  }

  for (const module of testModules) {
    const meta = fileMap.get(normalize(module.moduleId))
    if (!meta) {
      // Its results are still reported, but under `unknown:unknown`, so they
      // never reach the variant that owns them in the app.
      console.warn(pc.yellow(`⚠️  Histoire could not map the test module ${module.moduleId} back to a story variant.`))
    }
    for (const task of module.children.allTests()) {
      const result = task.result()
      const state = result.state === 'passed' ? 'passed' : result.state === 'skipped' ? 'skipped' : 'failed'
      // Plugin data set through `setHistoireTestData` travels in the task meta.
      const data = readHistoireTestData(task.meta())
      push(meta, { name: task.name, state, errors: serializeTestErrors((result.errors ?? []) as unknown[]), ...(data ? { data } : {}) })
    }
    // A spec that failed to import or mount registers no test case.
    pushVariantErrors(meta, typeof module.errors === 'function' ? module.errors() as unknown[] : [])
  }

  // The browser runner tags errors with the spec that was running when they surfaced.
  const runErrors: HistoireTestError[] = []
  for (const error of unhandledErrors) {
    const path = (error as { VITEST_TEST_PATH?: unknown } | null)?.VITEST_TEST_PATH
    const meta = typeof path === 'string' ? fileMap.get(normalize(path)) : undefined
    if (meta) {
      pushVariantErrors(meta, [error])
      continue
    }
    const [serialized] = serializeTestErrors([withCauses(error)])
    runErrors.push({ ...(typeof serialized === 'string' ? { message: serialized } : serialized), name: HISTOIRE_UNHANDLED_ERROR_NAME })
  }

  const summary = mergeHistoireTestSummaries([...groupedTests.values()].map(bucket => createHistoireTestSummary(bucket.storyId, bucket.variantId, bucket.tests)))
  return runErrors.length ? { ...summary, ok: false, errors: [...summary.errors, ...runErrors] } : summary
}

/**
 * Folds the `cause` chain of a browser error into its message. Serialized errors drop the
 * cause, yet Vitest's "Failed to import test file" only names the reason (mount timeout,
 * thrown setup) there.
 * @param error Error reported by Vitest, usually a plain serialized object.
 */
function withCauses(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('message' in error)) return error
  let message = String(error.message)
  let cause = (error as { cause?: unknown }).cause
  // Bounded walk: causes may be cyclic.
  for (let depth = 0; depth < 5 && typeof cause === 'object' && cause !== null && 'message' in cause; depth++) {
    message += `\nCaused by: ${String(cause.message)}`
    cause = (cause as { cause?: unknown }).cause
  }
  // `Error` keeps name and stack non-enumerable: copy them explicitly.
  const { name, stack } = error as { name?: unknown, stack?: unknown }
  return { ...error, ...(name === undefined ? {} : { name }), ...(stack === undefined ? {} : { stack }), message }
}
