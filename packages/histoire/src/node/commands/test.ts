import { createContext } from '../context.js'
import { ensureProjectVitest } from '../test/preflight.js'
import { exitAfterFlush } from '../util/exit.js'

export interface TestOptions {
  config?: string
}

/**
 * Runs Histoire's Vitest-based browser test command.
 * @param options Histoire command options.
 * @param rawVitestArgs Arguments forwarded to Vitest.
 */
export async function testCommand(options: TestOptions, rawVitestArgs: string[] = []) {
  const ctx = await createContext({
    configFile: options.config,
    mode: 'dev',
  })

  // Keep Vitest optional for every other Histoire command. Importing the test
  // runtime before this guard would fail with Node's module-resolution error
  // instead of Histoire's actionable install message.
  ensureProjectVitest(ctx)
  const { runHistoireTests } = await import('../test/index.js')
  const summary = await runHistoireTests(ctx, {
    rawVitestArgs,
  })

  if (!summary.ok) {
    process.exitCode = 1
  }

  // Never `process.exit()` straight after printing: a piped stdout (CI logs,
  // `| tee`) can still hold buffered writes that would be discarded, truncating
  // the report. Flush it, then let the process end naturally — a timed-out
  // browser/provider cleanup can leave live handles (playwright, ws, vite
  // servers) behind, so a forced exit stays as a last resort.
  await exitAfterFlush()
}
