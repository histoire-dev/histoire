import type { TestModule } from 'vitest/node'
import { normalize } from 'pathe'
import pc from 'picocolors'
import { formatVitestError } from '../util/vitest-errors.js'
import { reportStuckVitestRun } from '../util/vitest-stuck-run.js'

/**
 * Throws when a generated spec failed before Vitest could register individual
 * test case results.
 * @param testModules The test modules Vitest executed.
 */
export function assertVitestModulesHaveNoErrors(testModules: TestModule[]) {
  const errors = testModules.flatMap((module) => {
    return typeof module.errors === 'function'
      ? module.errors().map(formatVitestError)
      : []
  })

  if (errors.length) {
    throw new Error(errors.join('\n\n'))
  }
}

/**
 * Vitest resolves `include` entries as glob patterns, so glob-special
 * characters in project paths (SvelteKit `(group)`, Nuxt `[id]`…) can make
 * the generated spec paths match nothing — combined with `passWithNoTests`
 * the run would "pass" while executing zero specs. Surface the gap loudly.
 * @param testModules The test modules Vitest executed.
 * @param include The spec paths the run was told to execute.
 */
export function warnAboutMissingTestModules(testModules: TestModule[], include: string[]) {
  const executed = new Set(testModules.map(module => normalize(module.moduleId)))
  const missing = include.filter(path => !executed.has(normalize(path)))
  if (!missing.length) {
    return
  }

  console.warn(pc.yellow(`Histoire generated ${include.length} test spec file(s) but Vitest only executed ${testModules.length}. Missing:`))
  for (const file of missing) {
    console.warn(pc.yellow(`  - ${file}`))
  }
  console.warn(pc.yellow('If your project path contains glob-special characters ("()", "[]", "{}"), Vitest\'s include globs may not match the generated spec files.'))
}

/**
 * Prints what Vitest knows about a test run that never finished.
 * @param vitest The Vitest instance of the stuck run.
 */
export function reportStuckTestRun(vitest: Parameters<typeof reportStuckVitestRun>[0]) {
  reportStuckVitestRun(vitest, 'Histoire test run timed out')
}
