import type { HistoireTestCaseResultInput, HistoireTestRunSummary } from '@histoire/shared'
import type { TestModule } from 'vitest/node'
import type { GeneratedSpecFile } from './types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireTestSummary, mergeHistoireTestSummaries, serializeTestErrors } from '@histoire/shared'
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
    // Reuse the portable tuple identity so delimiters inside IDs cannot merge
    // independent targets in a multi-story server run.
    const key = getHistoireTargetKey({ storyId: meta?.storyId ?? 'unknown', variantId: meta?.variantId ?? 'unknown' })
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

  return mergeHistoireTestSummaries([...groupedTests.values()].map(bucket => createHistoireTestSummary(bucket.storyId, bucket.variantId, bucket.tests)))
}
