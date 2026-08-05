import type { HistoireTestCaseResultInput, HistoireTestRunSummary } from '@histoire/shared'
import type { TestModule } from 'vitest/node'
import type { GeneratedSpecFile } from './types.js'
import { createHistoireTestSummary, serializeTestErrors } from '@histoire/shared'
import { normalize } from 'pathe'
import pc from 'picocolors'

/**
 * Creates the summary of a run that executed no test at all.
 */
export function createEmptyTestSummary(): HistoireTestRunSummary {
  return {
    ok: true,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    tests: [],
  }
}

/**
 * Turns the Vitest test modules of a run into a Histoire run summary.
 *
 * Each module is mapped back to its story/variant through the generated spec
 * path, so results reach the right variant in the app.
 * @param testModules The test modules Vitest executed.
 * @param specFiles The specs generated for this run.
 */
export function summarizeResults(testModules: TestModule[], specFiles: GeneratedSpecFile[]): HistoireTestRunSummary {
  const fileMap = new Map(specFiles.map(item => [normalize(item.path), item]))
  const groupedTests = new Map<string, {
    storyId: string
    variantId: string
    tests: HistoireTestCaseResultInput[]
  }>()

  for (const module of testModules) {
    const meta = fileMap.get(normalize(module.moduleId))
    if (!meta) {
      // Its results are still reported, but under `unknown:unknown`, so they
      // never reach the variant that owns them in the app.
      console.warn(pc.yellow(`⚠️  Histoire could not map the test module ${module.moduleId} back to a story variant.`))
    }
    const key = `${meta?.storyId ?? 'unknown'}:${meta?.variantId ?? 'unknown'}`
    for (const task of module.children.allTests()) {
      const result = task.result()
      const state = result.state === 'passed' ? 'passed' : result.state === 'skipped' ? 'skipped' : 'failed'
      const serializedErrors = serializeTestErrors((result.errors ?? []) as unknown[])
      const bucket = groupedTests.get(key)

      if (bucket) {
        bucket.tests.push({
          id: String(bucket.tests.length),
          name: task.name,
          fullName: task.name,
          state,
          errors: serializedErrors,
        })
      }
      else {
        groupedTests.set(key, {
          storyId: meta?.storyId ?? 'unknown',
          variantId: meta?.variantId ?? 'unknown',
          tests: [{
            id: '0',
            name: task.name,
            fullName: task.name,
            state,
            errors: serializedErrors,
          }],
        })
      }
    }
  }

  const summary = createEmptyTestSummary()

  for (const bucket of groupedTests.values()) {
    const partial = createHistoireTestSummary(bucket.storyId, bucket.variantId, bucket.tests)
    summary.ok = summary.ok && partial.ok
    summary.total += partial.total
    summary.passed += partial.passed
    summary.failed += partial.failed
    summary.skipped += partial.skipped
    summary.errors.push(...partial.errors)
    summary.tests.push(...partial.tests)
  }

  return summary
}
