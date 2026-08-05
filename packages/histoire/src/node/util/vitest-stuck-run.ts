import type { TestModule } from 'vitest/node'
import pc from 'picocolors'
import { formatVitestError, getUnhandledVitestErrors } from './vitest-errors.js'

/** Minimal Vitest shape the timeout diagnostics read. */
interface StuckVitestLike {
  state: {
    getTestModules: () => TestModule[]
    getUnhandledErrors?: () => unknown[]
  }
}

/**
 * Prints what Vitest knows about a browser run that never finished.
 *
 * Shared by the story collection and the test run: a run that hangs leaves the
 * timeout error alone to explain itself, which never says what the browser was
 * actually doing.
 * @param vitest The Vitest instance of the stuck run.
 * @param title Headline naming the run that timed out.
 */
export function reportStuckVitestRun(vitest: StuckVitestLike, title: string) {
  const modules = vitest.state.getTestModules()
  const unhandled = getUnhandledVitestErrors(vitest)
  console.error(pc.red(`\n${title}`))
  console.error(pc.red(`  Test modules found: ${modules.length}`))
  console.error(pc.red(`  Unhandled errors: ${unhandled.length}`))

  for (const module of modules) {
    const errors = module.errors()
    console.error(pc.red(`  Module ${module.moduleId}: errors=${errors.length}`))
    for (const error of errors) {
      console.error(pc.red(`    ${formatVitestError(error)}`))
    }
  }

  for (const error of unhandled) {
    console.error(pc.red(`  Unhandled: ${error}`))
  }
}
